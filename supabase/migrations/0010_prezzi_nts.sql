-- Shop B2B DAV — prezzi da NTS: listino del cliente, condizioni con origine, netto al centesimo.
--
-- I dati li scrive il connettore in LAN (`npm run importa-prezzi -- --scrivi`), solo leggendo NTS:
--  - listini_nts: prezzo di listino per articolo e numero di listino (già al centesimo, come lo
--    accetta la frontiera) con gli sconti di listino (sconti.so_clscan = listino), come la funzione Graphite;
--  - clienti.listino_nts: listino del cliente in anagrafica NTS (an_listino; 0 = listino 2);
--  - condizioni_cliente con origine: storico_ps (prezzo speciale dallo storico), storico_sconto
--    (sconti dello storico sul listino di oggi), nts_prezzo (prezzo netto personale), nts_sconto
--    (sconto cliente × articolo), nts_generale (sconti in anagrafica). L'import scrive al massimo
--    una condizione per cliente e articolo: la priorità la decide lui.
-- Il prezzo finale è arrotondato al centesimo (2,36 −15 % = 2,006 → 2,01).

alter table public.clienti add column if not exists listino_nts smallint;

create table if not exists public.listini_nts (
  cod_dav        text not null references public.articoli(cod_dav) on delete cascade,
  listino        smallint not null,
  prezzo         numeric(12,2) not null,            -- al centesimo più vicino
  sconto1        numeric(6,3) not null default 0,   -- sconti di listino
  sconto2        numeric(6,3) not null default 0,
  valido_dal     date,
  aggiornato_il  timestamptz not null default now(),
  primary key (cod_dav, listino)
);
alter table public.listini_nts enable row level security;
create policy listini_nts_admin on public.listini_nts for select to authenticated using (public.is_admin());

alter table public.condizioni_cliente add column if not exists origine text not null default 'manuale';
alter table public.condizioni_cliente drop constraint if exists condizioni_cliente_origine_check;
alter table public.condizioni_cliente add constraint condizioni_cliente_origine_check
  check (origine in ('manuale', 'vendite', 'storico_ps', 'storico_sconto', 'nts_prezzo', 'nts_sconto', 'nts_generale'));
alter table public.condizioni_cliente add column if not exists rif_storico text;  -- es. "Ordine 23852 del 06/11/2026: 2,36 −15 %"

-- Le condizioni esistenti le ha create importa-vendite (ultimo netto fatturato): l'import NTS le sostituisce.
update public.condizioni_cliente set origine = 'vendite' where origine = 'manuale';

create index if not exists condizioni_cliente_cliente_idx on public.condizioni_cliente (cliente_id, tipo, cod_dav);

-- prezzo_cliente: listino del cliente da listini_nts (ripiego: articoli.prezzo_listino), sconti di
-- listino quando il cliente non ha condizioni, prezzo finale al centesimo. Stesse colonne di prima.
create or replace function public.prezzo_cliente(p_cliente_id bigint, p_cod_dav text)
returns table (
  listino          numeric,
  sconto1          numeric,
  sconto2          numeric,
  prezzo_accordato numeric,
  prezzo_finale    numeric,
  origine          text
)
language plpgsql stable security definer
set search_path = public
as $$
declare
  a record;
  c record;
  l record;
  n_lis smallint;
begin
  if auth.uid() is not null and not public.is_admin() and p_cliente_id is distinct from public.cliente_corrente() then
    raise exception 'prezzo_cliente: cliente non autorizzato' using errcode = '42501';
  end if;

  select ar.prezzo_listino, ar.famiglia_id into a from public.articoli ar where ar.cod_dav = p_cod_dav;
  if not found then return; end if;

  select coalesce(nullif(cl.listino_nts, 0), 2) into n_lis from public.clienti cl where cl.id = p_cliente_id;
  n_lis := coalesce(n_lis, 2);
  select ln.prezzo, ln.sconto1, ln.sconto2 into l from public.listini_nts ln where ln.cod_dav = p_cod_dav and ln.listino = n_lis;

  select cc.* into c
  from public.condizioni_cliente cc
  where cc.cliente_id = p_cliente_id
    and (cc.valido_dal is null or cc.valido_dal <= current_date)
    and (cc.valido_al  is null or cc.valido_al  >= current_date)
    and (
      (cc.tipo = 'articolo' and cc.cod_dav = p_cod_dav) or
      (cc.tipo = 'famiglia' and cc.famiglia_id = a.famiglia_id) or
      (cc.tipo = 'generale')
    )
  order by case cc.tipo when 'articolo' then 1 when 'famiglia' then 2 else 3 end, cc.id
  limit 1;

  listino := coalesce(l.prezzo, a.prezzo_listino);

  if c.id is not null and c.tipo = 'articolo' and c.prezzo_accordato is not null then
    sconto1 := 0;
    sconto2 := 0;
    prezzo_accordato := c.prezzo_accordato;
    prezzo_finale := round(c.prezzo_accordato, 2);
    origine := 'prezzo_accordato';
  elsif c.id is not null then
    sconto1 := coalesce(c.sconto1, 0);
    sconto2 := coalesce(c.sconto2, 0);
    prezzo_accordato := null;
    prezzo_finale := round(listino * (1 - sconto1 / 100) * (1 - sconto2 / 100), 2);
    origine := c.tipo;
  else
    sconto1 := coalesce(l.sconto1, 0);
    sconto2 := coalesce(l.sconto2, 0);
    prezzo_accordato := null;
    prezzo_finale := round(listino * (1 - sconto1 / 100) * (1 - sconto2 / 100), 2);
    origine := 'listino';
  end if;

  return next;
end;
$$;
revoke all on function public.prezzo_cliente(bigint, text) from public;
grant execute on function public.prezzo_cliente(bigint, text) to authenticated;
