-- Shop B2B DAV — carrello e conferma ordine (STRUTTURA, sezione 7)

-- Clienti creati dall'accesso demo (non da NTS): si riconoscono e si puliscono.
alter table public.clienti add column if not exists demo boolean not null default false;

-- Senza listino il prezzo di riga può non esistere ancora: resta null, mai inventato.
alter table public.righe_ordine alter column prezzo_finale drop not null;

-- Il cliente può modificare il proprio carrello (ordine in bozza) ---------------
create policy ordini_bozza_propria on public.ordini for update to authenticated
  using (cliente_id = public.cliente_corrente() and stato = 'bozza')
  with check (cliente_id = public.cliente_corrente() and stato in ('bozza', 'inviato'));

create policy righe_modifica_bozza on public.righe_ordine for update to authenticated
  using (exists (select 1 from public.ordini o where o.id = ordine_id and o.cliente_id = public.cliente_corrente() and o.stato = 'bozza'))
  with check (exists (select 1 from public.ordini o where o.id = ordine_id and o.cliente_id = public.cliente_corrente() and o.stato = 'bozza'));

create policy righe_cancella_bozza on public.righe_ordine for delete to authenticated
  using (exists (select 1 from public.ordini o where o.id = ordine_id and o.cliente_id = public.cliente_corrente() and o.stato = 'bozza'));

-- Conferma: ricalcola e copia i prezzi riga per riga, chiude l'ordine, aggiorna lo storico.
create or replace function public.conferma_ordine(p_ordine_id bigint, p_data_consegna date, p_note text)
returns public.ordini
language plpgsql security definer
set search_path = public
as $$
declare
  o public.ordini%rowtype;
  r record;
  p record;
  tot numeric := 0;
  n integer := 0;
begin
  select * into o from public.ordini where id = p_ordine_id for update;
  if not found then
    raise exception 'conferma_ordine: ordine inesistente';
  end if;
  if auth.uid() is not null and not public.is_admin() and o.cliente_id is distinct from public.cliente_corrente() then
    raise exception 'conferma_ordine: non autorizzato' using errcode = '42501';
  end if;
  if o.stato <> 'bozza' then
    raise exception 'conferma_ordine: ordine già confermato';
  end if;

  for r in select * from public.righe_ordine where ordine_id = o.id loop
    select * into p from public.prezzo_cliente(o.cliente_id, r.cod_dav);
    update public.righe_ordine
       set prezzo_listino   = p.listino,
           sconto1          = coalesce(p.sconto1, 0),
           sconto2          = coalesce(p.sconto2, 0),
           prezzo_accordato = p.prezzo_accordato,
           prezzo_finale    = p.prezzo_finale
     where id = r.id;
    tot := tot + coalesce(p.prezzo_finale, 0) * r.quantita;
    n := n + 1;
  end loop;
  if n = 0 then
    raise exception 'conferma_ordine: carrello vuoto';
  end if;

  update public.ordini
     set stato = 'inviato',
         data_consegna_richiesta = p_data_consegna,
         note = nullif(btrim(coalesce(p_note, '')), ''),
         totale_netto = round(tot, 2),
         creato_il = now()
   where id = o.id
   returning * into o;

  insert into public.storico_acquisti
    (cliente_id, cod_dav, ultima_data, ultima_quantita, n_ordini_12m, qta_12m, fatturato_12m, n_ordini_tot, qta_tot, fatturato_tot, prima_data)
  select o.cliente_id, ri.cod_dav, current_date, ri.quantita, 1, ri.quantita, coalesce(ri.prezzo_finale, 0) * ri.quantita,
         1, ri.quantita, coalesce(ri.prezzo_finale, 0) * ri.quantita, current_date
    from public.righe_ordine ri where ri.ordine_id = o.id
  on conflict (cliente_id, cod_dav) do update set
    ultima_data     = excluded.ultima_data,
    ultima_quantita = excluded.ultima_quantita,
    n_ordini_12m    = public.storico_acquisti.n_ordini_12m + 1,
    qta_12m         = public.storico_acquisti.qta_12m + excluded.qta_12m,
    fatturato_12m   = public.storico_acquisti.fatturato_12m + excluded.fatturato_12m,
    n_ordini_tot    = public.storico_acquisti.n_ordini_tot + 1,
    qta_tot         = public.storico_acquisti.qta_tot + excluded.qta_tot,
    fatturato_tot   = public.storico_acquisti.fatturato_tot + excluded.fatturato_tot,
    aggiornato_il   = now();

  insert into public.acquisti_mensili (cliente_id, cod_dav, anno, mese, qta, valore, n_righe)
  select o.cliente_id, ri.cod_dav,
         extract(year from current_date)::smallint, extract(month from current_date)::smallint,
         ri.quantita, coalesce(ri.prezzo_finale, 0) * ri.quantita, 1
    from public.righe_ordine ri where ri.ordine_id = o.id
  on conflict (cliente_id, cod_dav, anno, mese) do update set
    qta     = public.acquisti_mensili.qta + excluded.qta,
    valore  = public.acquisti_mensili.valore + excluded.valore,
    n_righe = public.acquisti_mensili.n_righe + 1;

  return o;
end;
$$;

revoke all on function public.conferma_ordine(bigint, date, text) from public;
grant execute on function public.conferma_ordine(bigint, date, text) to authenticated;
