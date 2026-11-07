-- Shop B2B DAV — funzioni (STRUTTURA, sezioni 3, 4, 5)

-- Sezione 4: descrizione pulita -----------------------------------------------
-- Taglia da " ART." in poi (anche senza spazio); altrimenti toglie l'ultima parola
-- se è una sigla nota per quel fornitore. Mai a mano: si ricalcola all'import.
create or replace function public.descrizione_pulita(p_descrizione text, p_sigle text[])
returns text
language plpgsql immutable
as $$
declare
  d text := btrim(coalesce(p_descrizione, ''));
  pos int;
  ultima text;
begin
  pos := position('ART.' in upper(d));
  if pos > 0 then
    d := btrim(left(d, pos - 1));
    if right(d, 1) = '-' then d := btrim(left(d, length(d) - 1)); end if;
    return d;
  end if;
  ultima := substring(d from '(\S+)\s*$');
  if ultima is not null and p_sigle is not null and upper(ultima) = any (p_sigle) then
    d := btrim(left(d, length(d) - length(ultima)));
  end if;
  return d;
end;
$$;

-- Sezione 5: disponibilità -----------------------------------------------------
create or replace function public.disponibilita(p_quantita numeric, p_soglia numeric default null)
returns text
language plpgsql stable
as $$
declare
  soglia numeric := p_soglia;
begin
  if soglia is null then
    select (valore #>> '{}')::numeric into soglia from public.impostazioni where chiave = 'soglia_esaurimento';
    soglia := coalesce(soglia, 2);
  end if;
  if coalesce(p_quantita, 0) <= 0 then return 'su_ordinazione'; end if;
  if p_quantita <= soglia then return 'in_esaurimento'; end if;
  return 'disponibile';
end;
$$;

-- Sezione 3: prezzo cliente ----------------------------------------------------
-- Condizioni valide oggi, in ordine articolo → famiglia → generale.
-- Prezzo accordato per articolo: vince su listino e sconti.
-- Altrimenti listino × (1 − sconto1 %) × (1 − sconto2 %). Nessuna condizione: listino.
-- Un cliente può interrogare solo il proprio prezzo; l'admin tutti.
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
begin
  if auth.uid() is not null and not public.is_admin() and p_cliente_id is distinct from public.cliente_corrente() then
    raise exception 'prezzo_cliente: cliente non autorizzato' using errcode = '42501';
  end if;

  select ar.prezzo_listino, ar.famiglia_id into a from public.articoli ar where ar.cod_dav = p_cod_dav;
  if not found then return; end if;

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

  listino := a.prezzo_listino;

  if c.id is not null and c.tipo = 'articolo' and c.prezzo_accordato is not null then
    sconto1 := 0;
    sconto2 := 0;
    prezzo_accordato := c.prezzo_accordato;
    prezzo_finale := c.prezzo_accordato;
    origine := 'prezzo_accordato';
  elsif c.id is not null then
    sconto1 := coalesce(c.sconto1, 0);
    sconto2 := coalesce(c.sconto2, 0);
    prezzo_accordato := null;
    prezzo_finale := round(listino * (1 - sconto1 / 100) * (1 - sconto2 / 100), 4);
    origine := c.tipo;
  else
    sconto1 := 0;
    sconto2 := 0;
    prezzo_accordato := null;
    prezzo_finale := listino;
    origine := 'listino';
  end if;

  return next;
end;
$$;

revoke all on function public.prezzo_cliente(bigint, text) from public;
grant execute on function public.prezzo_cliente(bigint, text) to authenticated;

-- Aggiornamento automatico di aggiornato_il ----------------------------------
create or replace function public.tocca_aggiornato_il()
returns trigger
language plpgsql
as $$
begin
  new.aggiornato_il := now();
  return new;
end;
$$;

create trigger articoli_tocca   before update on public.articoli   for each row execute function public.tocca_aggiornato_il();
create trigger fornitori_tocca  before update on public.fornitori  for each row execute function public.tocca_aggiornato_il();
create trigger clienti_tocca    before update on public.clienti    for each row execute function public.tocca_aggiornato_il();
create trigger giacenze_tocca   before update on public.giacenze   for each row execute function public.tocca_aggiornato_il();
create trigger condizioni_tocca before update on public.condizioni_cliente for each row execute function public.tocca_aggiornato_il();
create trigger fatture_tocca    before update on public.fatture    for each row execute function public.tocca_aggiornato_il();
