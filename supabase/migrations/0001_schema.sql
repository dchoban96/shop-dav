-- Shop B2B DAV — schema (STRUTTURA_SHOP_DAV.md, sezione 2)
-- Convenzioni: nomi in italiano, chiavi NTS come testo, importi senza IVA,
-- sconti in percentuale (0–100), date senza fuso, timestamp con fuso.

create extension if not exists pg_trgm;

-- Fornitori -------------------------------------------------------------------
create table public.fornitori (
  id               bigint generated always as identity primary key,
  codice_nts       text unique,
  nome_nts         text not null unique,
  nome_breve       text,
  sigle            text[] not null default '{}',   -- sigle finali in descrizione (sezione 4)
  cartella_foto    text,                           -- foto_fornitori/<cartella_foto>/<cod_dav>.*
  logo_path        text,
  presentazione    text,
  autorizzazione_il date,
  pubblicato       boolean not null default false, -- visibile in /partner
  attivo           boolean not null default true,
  aggiornato_il    timestamptz not null default now()
);

-- Famiglie --------------------------------------------------------------------
create table public.famiglie (
  id    bigint generated always as identity primary key,
  nome  text not null unique
);

-- Articoli --------------------------------------------------------------------
create table public.articoli (
  cod_dav             text primary key,
  descrizione_nts     text not null,
  descrizione_pulita  text,
  famiglia_id         bigint references public.famiglie(id),
  fornitore_id        bigint references public.fornitori(id),
  um                  text,
  pezzi_confezione    numeric(12,3),
  prezzo_listino      numeric(12,4),
  iva                 numeric(5,2),
  foto_path           text,
  scheda_pdf_path     text,
  fatturato_12m       numeric(14,2),
  top80               boolean not null default false,
  attivo              boolean not null default true,
  aggiornato_il       timestamptz not null default now()
);
create index articoli_famiglia_idx  on public.articoli (famiglia_id);
create index articoli_fornitore_idx on public.articoli (fornitore_id);
create index articoli_attivo_idx    on public.articoli (attivo);
create index articoli_ricerca_idx   on public.articoli using gin (
  (cod_dav || ' ' || descrizione_nts) gin_trgm_ops
);

-- Giacenze --------------------------------------------------------------------
create table public.giacenze (
  cod_dav        text primary key references public.articoli(cod_dav),
  quantita       numeric(14,3) not null default 0,
  aggiornato_il  timestamptz not null default now()
);

-- Clienti ---------------------------------------------------------------------
create table public.clienti (
  id                   bigint generated always as identity primary key,
  codice_nts           text not null unique,
  ragione_sociale      text not null,
  indirizzo            text,
  cap                  text,
  comune               text,
  provincia            text,
  email                text,
  piva                 text,
  agente_codice        text,
  priorita_onboarding  boolean not null default false,
  giorni_consegna      smallint[] not null default '{}',  -- 1 = lunedì … 6 = sabato
  metodo_pagamento     text,
  attivo               boolean not null default true,
  aggiornato_il        timestamptz not null default now()
);

create table public.clienti_telefoni (
  id             bigint generated always as identity primary key,
  cliente_id     bigint not null references public.clienti(id) on delete cascade,
  numero_e164    text not null,
  nome_contatto  text,
  usa_whatsapp   boolean not null default true,
  unique (cliente_id, numero_e164)
);

-- Utenti e inviti -------------------------------------------------------------
create table public.utenti (
  id           uuid primary key references auth.users(id) on delete cascade,
  cliente_id   bigint references public.clienti(id),
  ruolo        text not null check (ruolo in ('cliente', 'admin')),
  invitato_il  timestamptz,
  attivato_il  timestamptz,
  check (ruolo = 'admin' or cliente_id is not null)
);
create index utenti_cliente_idx on public.utenti (cliente_id);

create table public.inviti (
  token       text primary key,
  cliente_id  bigint not null references public.clienti(id),
  email       text not null,
  scade_il    timestamptz not null,
  usato_il    timestamptz,
  creato_il   timestamptz not null default now()
);

-- Condizioni commerciali ------------------------------------------------------
create table public.condizioni_cliente (
  id               bigint generated always as identity primary key,
  cliente_id       bigint not null references public.clienti(id) on delete cascade,
  tipo             text not null check (tipo in ('articolo', 'famiglia', 'generale')),
  cod_dav          text references public.articoli(cod_dav),
  famiglia_id      bigint references public.famiglie(id),
  sconto1          numeric(6,3) not null default 0,   -- percentuale
  sconto2          numeric(6,3) not null default 0,   -- percentuale
  prezzo_accordato numeric(12,4),                     -- prezzo netto fissato: vince su tutto
  valido_dal       date,
  valido_al        date,
  aggiornato_il    timestamptz not null default now(),
  check (
    (tipo = 'articolo' and cod_dav is not null and famiglia_id is null) or
    (tipo = 'famiglia' and famiglia_id is not null and cod_dav is null) or
    (tipo = 'generale' and cod_dav is null and famiglia_id is null)
  )
);
create index condizioni_cliente_idx on public.condizioni_cliente (cliente_id, tipo);

-- Storico e statistiche -------------------------------------------------------
create table public.storico_acquisti (
  cliente_id      bigint not null references public.clienti(id) on delete cascade,
  cod_dav         text not null references public.articoli(cod_dav),
  ultima_data     date,
  ultima_quantita numeric(14,3),
  n_ordini_12m    integer not null default 0,
  qta_12m         numeric(14,3) not null default 0,
  fatturato_12m   numeric(14,2) not null default 0,
  n_ordini_tot    integer not null default 0,
  qta_tot         numeric(14,3) not null default 0,
  fatturato_tot   numeric(14,2) not null default 0,
  prima_data      date,
  aggiornato_il   timestamptz not null default now(),
  primary key (cliente_id, cod_dav)
);

create table public.acquisti_mensili (
  cliente_id  bigint not null references public.clienti(id) on delete cascade,
  cod_dav     text not null references public.articoli(cod_dav),
  anno        smallint not null,
  mese        smallint not null check (mese between 1 and 12),
  qta         numeric(14,3) not null default 0,
  valore      numeric(14,2) not null default 0,
  n_righe     integer not null default 0,
  primary key (cliente_id, cod_dav, anno, mese)
);

create table public.raccomandazioni (
  cliente_id    bigint not null references public.clienti(id) on delete cascade,
  cod_dav       text not null references public.articoli(cod_dav),
  motivo        text not null check (motivo in ('non_ordini_da', 'top_famiglia', 'clienti_simili')),
  punteggio     numeric(8,4) not null default 0,
  calcolato_il  timestamptz not null default now(),
  primary key (cliente_id, cod_dav, motivo)
);

-- Evidenze (scelte dall'ufficio, nessun effetto sul prezzo) -------------------
create table public.evidenze (
  id       bigint generated always as identity primary key,
  cod_dav  text not null references public.articoli(cod_dav),
  ordine   integer not null default 0,
  testo    text,
  dal      date,
  al       date,
  attivo   boolean not null default true
);

-- Fatture (da scadenzario NTS, sola lettura per l'app) ------------------------
create table public.fatture (
  id             bigint generated always as identity primary key,
  cliente_id     bigint not null references public.clienti(id) on delete cascade,
  numero         text not null,
  data           date not null,
  scadenza       date,
  importo        numeric(14,2) not null,
  residuo        numeric(14,2) not null default 0,
  stato          text not null check (stato in ('da_pagare', 'scaduta', 'pagata')),
  aggiornato_il  timestamptz not null default now(),
  unique (cliente_id, numero)
);

-- Ordini ----------------------------------------------------------------------
create sequence public.ordini_numero_seq;

create table public.ordini (
  id                      bigint generated always as identity primary key,
  numero                  bigint not null default nextval('public.ordini_numero_seq') unique,
  cliente_id              bigint not null references public.clienti(id),
  utente_id               uuid references public.utenti(id),
  stato                   text not null default 'inviato'
                          check (stato in ('bozza', 'inviato', 'confermato', 'inserito_nts', 'consegnato', 'annullato')),
  data_consegna_richiesta date,
  note                    text,
  totale_netto            numeric(14,2) not null default 0,
  creato_il               timestamptz not null default now(),
  email_inviata_il        timestamptz
);
create index ordini_cliente_idx on public.ordini (cliente_id, creato_il desc);
create index ordini_stato_idx   on public.ordini (stato);

create table public.righe_ordine (
  id               bigint generated always as identity primary key,
  ordine_id        bigint not null references public.ordini(id) on delete cascade,
  cod_dav          text not null references public.articoli(cod_dav),
  descrizione      text not null,      -- copia al momento dell'ordine
  quantita         numeric(14,3) not null check (quantita > 0),
  um               text,
  prezzo_listino   numeric(12,4),
  sconto1          numeric(6,3) not null default 0,
  sconto2          numeric(6,3) not null default 0,
  prezzo_accordato numeric(12,4),
  prezzo_finale    numeric(12,4) not null,
  note             text
);
create index righe_ordine_ordine_idx on public.righe_ordine (ordine_id);

-- Import e impostazioni -------------------------------------------------------
create table public.import_log (
  id                bigint generated always as identity primary key,
  tipo              text not null,
  nome_file         text not null,
  righe_lette       integer not null default 0,
  nuovi             integer not null default 0,
  aggiornati        integer not null default 0,
  errori            integer not null default 0,
  dettaglio_errori  jsonb not null default '[]'::jsonb,
  eseguito_il       timestamptz not null default now(),
  eseguito_da       text
);

create table public.impostazioni (
  chiave  text primary key,
  valore  jsonb not null
);

insert into public.impostazioni (chiave, valore) values
  ('soglia_esaurimento', '2'),                      -- confezioni
  ('email_ordini', '"info@davsnc.it"'),
  ('giorni_consegna_default', '[1,2,3,4,5]'),
  ('mittente_email', '"ordini@davsnc.it"');
