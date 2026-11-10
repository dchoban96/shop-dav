-- Shop B2B DAV — sconti del cliente oltre il 20 %: al cliente si mostra il listino.
--
-- Decisione dell'ufficio del 10/11/2026: se il cliente non ha un prezzo speciale e la sua condizione
-- (storico, sconto NTS o sconto generale) dà uno sconto complessivo oltre il 20 %, nello shop vede il
-- listino con la scritta "scontistica non disponibile, chiedere info all'agente o all'ufficio DAV".
-- La condizione resta in condizioni_cliente (l'ufficio la vede "da controllare"); prezzo_cliente
-- restituisce il listino, sconti 0 e origine 'sconto_da_verificare'. Gli sconti di listino
-- (uguali per tutti i clienti di quel listino) e i prezzi speciali non cambiano.

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
  soglia constant numeric := 20;   -- sconto complessivo massimo mostrato al cliente (%)
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
  elsif c.id is not null
        and (1 - (1 - coalesce(c.sconto1, 0) / 100) * (1 - coalesce(c.sconto2, 0) / 100)) * 100 > soglia then
    -- sconto oltre la soglia: listino pieno, da chiedere all'agente o all'ufficio
    sconto1 := 0;
    sconto2 := 0;
    prezzo_accordato := null;
    prezzo_finale := round(listino, 2);
    origine := 'sconto_da_verificare';
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
