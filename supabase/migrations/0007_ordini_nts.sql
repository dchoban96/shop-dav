-- Shop B2B DAV — ordini dello shop inseriti in NTS dal connettore in LAN
-- (BRIEF_INTEGRAZIONE_NTS, sezioni 4 e 5).
--
-- Flusso di stato_nts:
--   da_inviare → in_invio → in_frontiera → in_nts
--                    ↘ errore / da_verificare (+ email all'ufficio) → manuale (ufficio)
-- stato_nts resta NULL per i carrelli (bozza), per gli ordini dei clienti demo e per
-- gli ordini confermati prima di questa migrazione: il connettore non li tocca mai.

-- Colonne ---------------------------------------------------------------------------
alter table public.ordini
  add column if not exists stato_nts       text
    check (stato_nts in ('da_inviare', 'in_invio', 'in_frontiera', 'in_nts', 'da_verificare', 'errore', 'manuale')),
  add column if not exists riferimento_nts text unique,          -- 'SHOP-000123', assegnato alla conferma
  add column if not exists id_frontiera    bigint,               -- NTS_FRONTIERA.dbo.GPH_TESTATA_NTS.ID
  add column if not exists numero_nts      integer,              -- solo informativo: NTS riusa i numeri
  add column if not exists errore_nts      text,
  add column if not exists tentativi_nts   integer not null default 0,
  add column if not exists in_invio_il     timestamptz,
  add column if not exists in_frontiera_il timestamptz,
  add column if not exists in_nts_il       timestamptz,
  add column if not exists prova_ok_il     timestamptz;          -- ultima prova a secco riuscita (MODALITA=prova)

create index if not exists ordini_stato_nts_idx on public.ordini (stato_nts)
  where stato_nts in ('da_inviare', 'in_invio', 'in_frontiera', 'da_verificare', 'errore');

-- Registro dei passaggi ---------------------------------------------------------------
create table if not exists public.log_nts (
  id         bigint generated always as identity primary key,
  ordine_id  bigint references public.ordini(id) on delete cascade,
  quando     timestamptz not null default now(),
  evento     text not null,
  dettaglio  text
);
create index if not exists log_nts_ordine_idx on public.log_nts (ordine_id, quando desc);

alter table public.log_nts enable row level security;
create policy log_nts_admin on public.log_nts for select to authenticated using (public.is_admin());

-- Protezione: le colonne NTS le scrivono solo il connettore (service role), le funzioni
-- qui sotto o un admin. Un cliente autenticato non può toccarle, nemmeno sul suo carrello.
create or replace function public.ordini_nts_protezione()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.stato_nts is not null or new.riferimento_nts is not null or new.id_frontiera is not null
       or new.numero_nts is not null or new.errore_nts is not null or new.tentativi_nts <> 0
       or new.in_invio_il is not null or new.in_frontiera_il is not null or new.in_nts_il is not null
       or new.prova_ok_il is not null then
      raise exception 'ordini: campi NTS riservati' using errcode = '42501';
    end if;
  elsif (new.stato_nts, new.riferimento_nts, new.id_frontiera, new.numero_nts, new.errore_nts, new.tentativi_nts,
         new.in_invio_il, new.in_frontiera_il, new.in_nts_il, new.prova_ok_il)
        is distinct from
        (old.stato_nts, old.riferimento_nts, old.id_frontiera, old.numero_nts, old.errore_nts, old.tentativi_nts,
         old.in_invio_il, old.in_frontiera_il, old.in_nts_il, old.prova_ok_il) then
    raise exception 'ordini: campi NTS riservati' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Alla conferma (bozza → inviato): riferimento e coda verso NTS. I trigger partono in
-- ordine alfabetico: prima la protezione (sui valori del chiamante), poi questo.
create or replace function public.ordini_nts_alla_conferma()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stato = 'inviato' and (tg_op = 'INSERT' or old.stato = 'bozza') and new.riferimento_nts is null then
    new.riferimento_nts := 'SHOP-' || case when new.numero < 1000000 then lpad(new.numero::text, 6, '0') else new.numero::text end;
    if not coalesce((select demo from public.clienti where id = new.cliente_id), true) then
      new.stato_nts := 'da_inviare';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists ordini_nts_10_protezione on public.ordini;
create trigger ordini_nts_10_protezione before insert or update on public.ordini
  for each row execute function public.ordini_nts_protezione();

drop trigger if exists ordini_nts_20_conferma on public.ordini;
create trigger ordini_nts_20_conferma before insert or update of stato on public.ordini
  for each row execute function public.ordini_nts_alla_conferma();

-- Claim atomico: fino a n ordini da 'da_inviare' a 'in_invio', con le righe -------------
-- Due connettori in parallelo non prendono mai lo stesso ordine (SKIP LOCKED).
-- Con p_prova salta gli ordini che hanno già superato la prova a secco.
-- I numeri escono come testo per non perdere decimali per strada.
create or replace function public.claim_ordini_nts(n integer, p_prova boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  presi bigint[];
  risultato jsonb;
begin
  with candidati as (
    select o.id
      from public.ordini o
     where o.stato_nts = 'da_inviare'
       and o.stato in ('inviato', 'confermato')
       and (not coalesce(p_prova, false) or o.prova_ok_il is null)
     order by o.id
     limit greatest(coalesce(n, 0), 0)
     for update skip locked
  ), aggiornati as (
    update public.ordini o
       set stato_nts = 'in_invio', tentativi_nts = o.tentativi_nts + 1, in_invio_il = now()
      from candidati c
     where o.id = c.id
    returning o.id
  )
  select coalesce(array_agg(id order by id), '{}') into presi from aggiornati;

  if cardinality(presi) = 0 then
    return '[]'::jsonb;
  end if;

  insert into public.log_nts (ordine_id, evento, dettaglio)
  select x, 'in_invio', 'preso dal connettore' from unnest(presi) as x;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', o.id,
           'numero', o.numero,
           'riferimento_nts', o.riferimento_nts,
           'creato_il', o.creato_il,
           'data_consegna_richiesta', o.data_consegna_richiesta,
           'note', o.note,
           'tentativi_nts', o.tentativi_nts,
           'cliente', jsonb_build_object('id', c.id, 'codice_nts', c.codice_nts, 'ragione_sociale', c.ragione_sociale),
           'righe', (select coalesce(jsonb_agg(jsonb_build_object(
                              'id', r.id, 'cod_dav', r.cod_dav, 'descrizione', r.descrizione,
                              'quantita', r.quantita::text, 'um', r.um,
                              'prezzo_listino', r.prezzo_listino::text, 'sconto1', r.sconto1::text, 'sconto2', r.sconto2::text,
                              'prezzo_accordato', r.prezzo_accordato::text, 'note', r.note) order by r.id), '[]'::jsonb)
                       from public.righe_ordine r where r.ordine_id = o.id)
         ) order by o.id), '[]'::jsonb)
    into risultato
    from public.ordini o
    join public.clienti c on c.id = o.cliente_id
   where o.id = any(presi);
  return risultato;
end;
$$;

-- Passaggio di stato condizionato + riga di log, in un colpo solo -------------------------
-- Cambia solo se lo stato attuale è tra p_da: il connettore e l'ufficio non si pestano i piedi.
-- Restituisce true se il passaggio è avvenuto.
create or replace function public.passa_stato_nts(
  p_ordine_id        bigint,
  p_da               text[],
  p_a                text,
  p_id_frontiera     bigint  default null,
  p_numero_nts       integer default null,
  p_errore           text    default null,
  p_evento           text    default null,
  p_dettaglio        text    default null,
  p_prova_ok         boolean default false,
  p_azzera_tentativi boolean default false)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.ordini o set
    stato_nts       = p_a,
    id_frontiera    = coalesce(p_id_frontiera, o.id_frontiera),
    numero_nts      = coalesce(p_numero_nts, o.numero_nts),
    errore_nts      = case when p_a in ('errore', 'da_verificare') then p_errore
                           when p_a in ('in_nts', 'manuale', 'da_inviare') then null
                           else o.errore_nts end,
    in_frontiera_il = case when p_a = 'in_frontiera' then coalesce(o.in_frontiera_il, now()) else o.in_frontiera_il end,
    in_nts_il       = case when p_a = 'in_nts' then now() else o.in_nts_il end,
    prova_ok_il     = case when p_prova_ok then now() else o.prova_ok_il end,
    tentativi_nts   = case when p_azzera_tentativi then 0 else o.tentativi_nts end,
    stato           = case when p_a in ('in_nts', 'manuale') and o.stato in ('inviato', 'confermato') then 'inserito_nts' else o.stato end
  where o.id = p_ordine_id
    and o.stato_nts = any(p_da);
  get diagnostics n = row_count;
  if n > 0 then
    insert into public.log_nts (ordine_id, evento, dettaglio)
    values (p_ordine_id, coalesce(p_evento, p_a), coalesce(p_dettaglio, p_errore));
  end if;
  return n > 0;
end;
$$;

revoke all on function public.claim_ordini_nts(integer, boolean) from public, anon, authenticated;
revoke all on function public.passa_stato_nts(bigint, text[], text, bigint, integer, text, text, text, boolean, boolean) from public, anon, authenticated;
revoke all on function public.ordini_nts_alla_conferma() from public, anon, authenticated;
grant execute on function public.claim_ordini_nts(integer, boolean) to service_role;
grant execute on function public.passa_stato_nts(bigint, text[], text, bigint, integer, text, text, text, boolean, boolean) to service_role;
