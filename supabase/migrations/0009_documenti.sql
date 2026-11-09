-- Shop B2B DAV — documenti e pagamenti del cliente (brief "Documenti e pagamenti", sezione 2).
--
-- DDT, fatture e note di credito di NTS (testmag/movmag), con righe, riepilogo IVA e scadenze.
-- Li scrive SOLO il connettore in LAN (service role): ogni 15 minuti gli ultimi 10 giorni e le
-- scadenze aperte, ogni notte il ripasso di 24 mesi. Il cliente legge solo i propri.
-- Non si cancella mai niente: un documento sparito da NTS passa a presente_in_nts = false
-- e il cliente non lo vede più.
--
-- La vecchia tabella `fatture` (0001) non è mai stata usata: la sostituiscono documenti + scadenze.

-- Pagamento del cliente da NTS (codice + descrizione, es. "8 RIMESSA DIRETTA FINE MESE") -----------
alter table public.clienti add column if not exists pagamento_codice text;
alter table public.clienti add column if not exists pagamento_desc   text;

-- Testate --------------------------------------------------------------------------------------------
create table if not exists public.documenti (
  id                 bigint generated always as identity primary key,
  chiave_nts         text not null unique,          -- tipo+anno+serie+numero, es. "B/2026//18931"
  cliente_id         bigint not null references public.clienti(id) on delete cascade,
  tipo               text not null check (tipo in ('ddt', 'fattura', 'nota_credito')),
  sottotipo          text,                          -- 'differita', 'immediata', … (da NTS)
  anno               smallint not null,
  serie              text not null default '',
  numero             integer not null,
  data_doc           date not null,
  destinazione       text,                          -- luogo di destinazione o 'Idem'
  agente_desc        text,
  pagamento_codice   text,
  pagamento_desc     text,
  imponibile         numeric(14,2) not null default 0,
  iva                numeric(14,2) not null default 0,
  totale             numeric(14,2) not null default 0,
  -- solo DDT
  trasporto_a_cura   text,
  causale_trasporto  text,
  aspetto_esteriore  text,
  vettore            text,
  totale_colli       numeric(12,2),
  peso               numeric(12,3),
  note               text,
  presente_in_nts    boolean not null default true,
  aggiornato_il      timestamptz not null default now()
);
create index if not exists documenti_cliente_idx on public.documenti (cliente_id, tipo, data_doc desc);
create index if not exists documenti_numero_idx  on public.documenti (cliente_id, tipo, numero, data_doc);

-- Righe ----------------------------------------------------------------------------------------------
create table if not exists public.righe_documento (
  id                 bigint generated always as identity primary key,
  documento_id       bigint not null references public.documenti(id) on delete cascade,
  riga               integer not null,
  tipo_riga          text not null default 'articolo' check (tipo_riga in ('articolo', 'rif_ddt', 'rif_ordine', 'nota')),
  cod_dav            text,                          -- nessun vincolo: c'è anche l'articolo generico M
  descrizione        text,                          -- QUELLA DELLA RIGA, non dell'anagrafica
  cod_fornitore      text,
  um                 text,
  quantita           numeric(14,3),
  prezzo             numeric(14,3),
  sconti_testo       text,                          -- es. '10', '10+5'
  importo            numeric(14,2),
  codice_iva         text,
  aliquota_iva       numeric(5,2),
  lotto              text,
  scadenza_lotto     date,
  rif_ddt_numero     integer,                       -- righe di fattura: DDT di provenienza
  rif_ddt_data       date,
  rif_ordine_anno    smallint,                      -- righe di DDT: ordine NTS di provenienza
  rif_ordine_numero  integer,
  rif_ordine_data    date,
  rif_ordine_shop    text,                          -- 'SHOP-000123' se l'ordine NTS è nato dallo shop (testord.td_riferim)
  unique (documento_id, riga)
);
create index if not exists righe_documento_shop_idx on public.righe_documento (rif_ordine_shop) where rif_ordine_shop is not null;

-- Riepilogo IVA --------------------------------------------------------------------------------------
create table if not exists public.riepilogo_iva (
  documento_id  bigint not null references public.documenti(id) on delete cascade,
  codice_iva    text not null,
  descrizione   text,
  aliquota      numeric(5,2),
  imponibile    numeric(14,2) not null default 0,
  imposta       numeric(14,2) not null default 0,
  primary key (documento_id, codice_iva)
);

-- Scadenze (partite) ---------------------------------------------------------------------------------
create table if not exists public.scadenze (
  id               bigint generated always as identity primary key,
  chiave_nts       text not null unique,
  cliente_id       bigint not null references public.clienti(id) on delete cascade,
  documento_id     bigint references public.documenti(id) on delete set null,  -- null se non collegabile
  data_scadenza    date not null,
  importo          numeric(14,2) not null,
  residuo          numeric(14,2) not null default 0,
  stato            text not null check (stato in ('aperta', 'pagata', 'insoluta')),
  tipo_pagamento   text,
  presente_in_nts  boolean not null default true,
  aggiornato_il    timestamptz not null default now()
);
create index if not exists scadenze_cliente_idx on public.scadenze (cliente_id, stato, data_scadenza);

-- Invii dei PDF (shop, WhatsApp, email) ---------------------------------------------------------------
create table if not exists public.invii_documenti (
  id            bigint generated always as identity primary key,
  documento_id  bigint not null references public.documenti(id) on delete cascade,
  canale        text not null check (canale in ('shop', 'whatsapp', 'email')),
  destinatario  text,
  utente_id     uuid,
  quando        timestamptz not null default now()
);

-- Heartbeat di ogni giro di sincronizzazione ----------------------------------------------------------
create table if not exists public.sync_stato (
  lavoro         text primary key,                 -- 'documenti_15min', 'documenti_notte', 'scadenze', …
  ultimo_ok      timestamptz,
  ultimo_errore  text,
  errore_il      timestamptz,
  righe          integer,
  aggiornato_il  timestamptz not null default now()
);

drop trigger if exists documenti_tocca on public.documenti;
create trigger documenti_tocca before update on public.documenti for each row execute function public.tocca_aggiornato_il();
drop trigger if exists scadenze_tocca on public.scadenze;
create trigger scadenze_tocca  before update on public.scadenze  for each row execute function public.tocca_aggiornato_il();
drop trigger if exists sync_stato_tocca on public.sync_stato;
create trigger sync_stato_tocca before insert or update on public.sync_stato for each row execute function public.tocca_aggiornato_il();

-- Ordine dello shop consegnato: quando arriva una riga di DDT che rimanda a un ordine SHOP-…,
-- l'ordine dello shop passa da solo a "consegnato" (brief, sezione 5).
create or replace function public.consegna_ordine_shop()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ordine  bigint;
  v_ddt     text;
begin
  if new.rif_ordine_shop is null then
    return new;
  end if;
  select d.numero::text || ' del ' || to_char(d.data_doc, 'DD/MM/YYYY') into v_ddt
    from public.documenti d where d.id = new.documento_id and d.tipo = 'ddt' and d.presente_in_nts;
  if v_ddt is null then
    return new;
  end if;
  update public.ordini o set stato = 'consegnato'
   where o.riferimento_nts = new.rif_ordine_shop and o.stato in ('inviato', 'confermato', 'inserito_nts')
  returning o.id into v_ordine;
  if v_ordine is not null then
    insert into public.log_nts (ordine_id, evento, dettaglio) values (v_ordine, 'consegnato', 'DDT ' || v_ddt);
  end if;
  return new;
end;
$$;
revoke all on function public.consegna_ordine_shop() from public, anon, authenticated;

drop trigger if exists righe_documento_consegna on public.righe_documento;
create trigger righe_documento_consegna after insert or update of rif_ordine_shop on public.righe_documento
  for each row execute function public.consegna_ordine_shop();

-- RLS: il cliente legge solo i propri documenti presenti in NTS; scrive solo il service role ------------
alter table public.documenti        enable row level security;
alter table public.righe_documento  enable row level security;
alter table public.riepilogo_iva    enable row level security;
alter table public.scadenze         enable row level security;
alter table public.invii_documenti  enable row level security;
alter table public.sync_stato       enable row level security;

drop policy if exists documenti_propri on public.documenti;
create policy documenti_propri on public.documenti for select to authenticated
  using ((cliente_id = public.cliente_corrente() and presente_in_nts) or public.is_admin());

drop policy if exists righe_documento_proprie on public.righe_documento;
create policy righe_documento_proprie on public.righe_documento for select to authenticated
  using (exists (select 1 from public.documenti d where d.id = documento_id
                  and ((d.cliente_id = public.cliente_corrente() and d.presente_in_nts) or public.is_admin())));

drop policy if exists riepilogo_iva_proprio on public.riepilogo_iva;
create policy riepilogo_iva_proprio on public.riepilogo_iva for select to authenticated
  using (exists (select 1 from public.documenti d where d.id = documento_id
                  and ((d.cliente_id = public.cliente_corrente() and d.presente_in_nts) or public.is_admin())));

drop policy if exists scadenze_proprie on public.scadenze;
create policy scadenze_proprie on public.scadenze for select to authenticated
  using ((cliente_id = public.cliente_corrente() and presente_in_nts) or public.is_admin());

drop policy if exists invii_documenti_admin on public.invii_documenti;
create policy invii_documenti_admin on public.invii_documenti for select to authenticated using (public.is_admin());

drop policy if exists sync_stato_admin on public.sync_stato;
create policy sync_stato_admin on public.sync_stato for select to authenticated using (public.is_admin());
