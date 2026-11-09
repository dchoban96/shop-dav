/**
 * Applica le migrazioni su un Postgres in memoria (PGlite) e verifica le funzioni
 * con dati finti. Non tocca Supabase. Eseguire con: npm run test:db
 */
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "supabase", "migrations");

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

async function main() {
  const db = new PGlite({ extensions: { pg_trgm } });

  // Stub minimo dello schema auth di Supabase e dei ruoli
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    -- Stub di pg_net, pg_cron e Vault (estensioni Supabase assenti in PGlite)
    create schema net;
    create table net.chiamate (id bigserial primary key, url text, body jsonb, headers jsonb);
    create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds integer default 5000)
      returns bigint language sql as $$ insert into net.chiamate (url, body, headers) values (url, body, headers) returning id $$;
    create schema cron;
    create table cron.job (jobname text primary key, schedule text, command text);
    create function cron.schedule(nome text, quando text, comando text) returns bigint language sql as $$
      insert into cron.job values (nome, quando, comando) on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning 1::bigint $$;
    create schema vault;
    create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
    end $$;
  `);

  for (const f of readdirSync(DIR).filter((x) => x.endsWith(".sql")).sort()) {
    process.stdout.write(`migrazione ${f} … `);
    // Le estensioni Supabase sono sostituite dagli stub qui sopra.
    await db.exec(readFileSync(join(DIR, f), "utf8").replace(/^create extension if not exists pg_(net|cron);$/gm, ""));
    console.log("ok");
  }

  // Dati finti
  await db.exec(`
    insert into fornitori (nome_nts, nome_breve, sigle) values ('IRCA', 'Irca', '{IR,IRCA}');
    insert into famiglie (nome) values ('IRCA'), ('Latticini');
    insert into articoli (cod_dav, descrizione_nts, famiglia_id, fornitore_id, prezzo_listino)
      values ('FARMIR', 'FARCITURA MIRTILLI KG.6 IR', 1, 1, 30.00),
             ('A4803',  'UOVA SFUSE LARGE CAT. A PZ.90 ART.A4803 AIA', 2, 1, 20.00),
             ('ALTRO',  'ARTICOLO SENZA CONDIZIONI', 2, 1, 10.00);
    insert into giacenze (cod_dav, quantita) values ('FARMIR', 0), ('A4803', 1), ('ALTRO', 50);
    insert into clienti (codice_nts, ragione_sociale) values ('C001', 'Pasticceria Prova');
    insert into condizioni_cliente (cliente_id, tipo, sconto1, sconto2) values (1, 'generale', 10, 0);
    insert into condizioni_cliente (cliente_id, tipo, famiglia_id, sconto1, sconto2) values (1, 'famiglia', 1, 20, 5);
    insert into condizioni_cliente (cliente_id, tipo, cod_dav, prezzo_accordato) values (1, 'articolo', 'A4803', 17.50);
  `);

  // descrizione_pulita
  const d1 = await db.query<{ d: string }>(`select descrizione_pulita('FARCITURA MIRTILLI KG.6 IR', '{IR}') d`);
  assert(d1.rows[0].d === "FARCITURA MIRTILLI KG.6", `pulita sigla: ${d1.rows[0].d}`);
  const d2 = await db.query<{ d: string }>(`select descrizione_pulita('UOVA SFUSE LARGE CAT. A PZ.90 ART.A4803 AIA', '{}') d`);
  assert(d2.rows[0].d === "UOVA SFUSE LARGE CAT. A PZ.90", `pulita ART.: ${d2.rows[0].d}`);
  const d3 = await db.query<{ d: string }>(`select descrizione_pulita('CETRIOLINI KG.5X3 ART.100610 RIZZI', '{}') d`);
  assert(d3.rows[0].d === "CETRIOLINI KG.5X3", `pulita ART. 2: ${d3.rows[0].d}`);
  const d4 = await db.query<{ d: string }>(`select descrizione_pulita('BURRO KG.1', '{DE}') d`);
  assert(d4.rows[0].d === "BURRO KG.1", `pulita senza sigla: ${d4.rows[0].d}`);

  // disponibilita (soglia 2 dalle impostazioni)
  const disp = await db.query<{ a: string; b: string; c: string }>(
    `select disponibilita(0) a, disponibilita(1) b, disponibilita(50) c`,
  );
  assert(disp.rows[0].a === "su_ordinazione" && disp.rows[0].b === "in_esaurimento" && disp.rows[0].c === "disponibile", `disponibilita: ${JSON.stringify(disp.rows[0])}`);

  // prezzo_cliente: precedenza articolo (accordato) > famiglia > generale > listino
  type P = { listino: string; sconto1: string; sconto2: string; prezzo_accordato: string | null; prezzo_finale: string; origine: string };
  const p1 = (await db.query<P>(`select * from prezzo_cliente(1, 'A4803')`)).rows[0];
  assert(p1.origine === "prezzo_accordato" && Number(p1.prezzo_finale) === 17.5, `accordato: ${JSON.stringify(p1)}`);
  const p2 = (await db.query<P>(`select * from prezzo_cliente(1, 'FARMIR')`)).rows[0];
  assert(p2.origine === "famiglia" && Number(p2.prezzo_finale) === 22.8, `famiglia: ${JSON.stringify(p2)}`); // 30 × 0.8 × 0.95
  const p3 = (await db.query<P>(`select * from prezzo_cliente(1, 'ALTRO')`)).rows[0];
  assert(p3.origine === "generale" && Number(p3.prezzo_finale) === 9, `generale: ${JSON.stringify(p3)}`);
  await db.exec(`insert into clienti (codice_nts, ragione_sociale) values ('C002', 'Senza condizioni')`);
  const p4 = (await db.query<P>(`select * from prezzo_cliente(2, 'ALTRO')`)).rows[0];
  assert(p4.origine === "listino" && Number(p4.prezzo_finale) === 10, `listino: ${JSON.stringify(p4)}`);
  const p5 = await db.query(`select * from prezzo_cliente(1, 'NON_ESISTE')`);
  assert(p5.rows.length === 0, "articolo inesistente → nessuna riga");

  // prezzi_cliente: stessi risultati di prezzo_cliente, in un colpo solo; i codici sconosciuti spariscono
  const pb = (await db.query<{ cod_dav: string; prezzo_finale: string; origine: string }>(`select * from prezzi_cliente(1, '{A4803,FARMIR,ALTRO,NON_ESISTE}') order by cod_dav`)).rows;
  assert(pb.length === 3, `prezzi_cliente: ${pb.length} righe invece di 3`);
  const perCod = Object.fromEntries(pb.map((r) => [r.cod_dav, r]));
  assert(Number(perCod.A4803.prezzo_finale) === 17.5 && perCod.A4803.origine === "prezzo_accordato", `prezzi_cliente A4803: ${JSON.stringify(perCod.A4803)}`);
  assert(Number(perCod.FARMIR.prezzo_finale) === 22.8 && Number(perCod.ALTRO.prezzo_finale) === 9, `prezzi_cliente famiglia/generale: ${JSON.stringify(pb)}`);

  // conferma_ordine: prezzi copiati riga per riga, totale, storico e mensili aggiornati
  await db.exec(`
    insert into ordini (cliente_id, stato) values (1, 'bozza');
    insert into righe_ordine (ordine_id, cod_dav, descrizione, quantita) values (1, 'FARMIR', 'FARCITURA MIRTILLI KG.6', 2), (1, 'A4803', 'UOVA', 1);
  `);
  const conf = (await db.query<{ stato: string; totale_netto: string }>(`select stato, totale_netto from conferma_ordine(1, current_date + 1, '  ')`)).rows[0];
  assert(conf.stato === "inviato" && Number(conf.totale_netto) === 63.1, `conferma_ordine: ${JSON.stringify(conf)}`); // 22.8 × 2 + 17.5
  const riga = (await db.query<{ prezzo_finale: string; origine: string | null }>(`select prezzo_finale, null as origine from righe_ordine where ordine_id = 1 and cod_dav = 'A4803'`)).rows[0];
  assert(Number(riga.prezzo_finale) === 17.5, `prezzo copiato in riga: ${JSON.stringify(riga)}`);
  const st = (await db.query<{ n: number; q: string; f: string }>(`select n_ordini_12m n, ultima_quantita q, fatturato_12m f from storico_acquisti where cliente_id = 1 and cod_dav = 'FARMIR'`)).rows[0];
  assert(st && Number(st.n) === 1 && Number(st.q) === 2 && Number(st.f) === 45.6, `storico: ${JSON.stringify(st)}`);
  const me = (await db.query<{ n: string }>(`select count(*) n from acquisti_mensili where cliente_id = 1`)).rows[0];
  assert(Number(me.n) === 2, `mensili: ${me.n}`);
  let doppia = false;
  try {
    await db.query(`select * from conferma_ordine(1, current_date + 1, null)`);
  } catch {
    doppia = true;
  }
  assert(doppia, "conferma_ordine su ordine già inviato deve fallire");

  // NTS: alla conferma riferimento e coda; claim atomico con righe; passaggi condizionati
  const o1 = (await db.query<{ riferimento_nts: string; stato_nts: string }>(`select riferimento_nts, stato_nts from ordini where id = 1`)).rows[0];
  assert(o1.riferimento_nts === "SHOP-000001" && o1.stato_nts === "da_inviare", `riferimento alla conferma: ${JSON.stringify(o1)}`);
  await db.exec(`insert into ordini (cliente_id, stato) values (2, 'bozza')`);
  const bozza = (await db.query<{ s: string | null; r: string | null }>(`select stato_nts s, riferimento_nts r from ordini where stato = 'bozza'`)).rows[0];
  assert(bozza.s === null && bozza.r === null, `carrello senza stato NTS: ${JSON.stringify(bozza)}`);
  type Claim = { id: number; riferimento_nts: string; cliente: { codice_nts: string }; righe: { cod_dav: string; quantita: string; prezzo_listino: string; sconto1: string; prezzo_accordato: string | null }[] }[];
  const presi = (await db.query<{ c: Claim }>(`select claim_ordini_nts(5) c`)).rows[0].c;
  assert(presi.length === 1 && presi[0].riferimento_nts === "SHOP-000001" && presi[0].cliente.codice_nts === "C001", `claim: ${JSON.stringify(presi)}`);
  const rFar = presi[0].righe.find((r) => r.cod_dav === "FARMIR")!;
  assert(rFar.quantita === "2.000" && rFar.prezzo_listino === "30.0000" && rFar.sconto1 === "20.000", `claim righe come testo: ${JSON.stringify(rFar)}`);
  assert(presi[0].righe.find((r) => r.cod_dav === "A4803")!.prezzo_accordato === "17.5000", "claim: prezzo accordato");
  const ancora = (await db.query<{ c: Claim }>(`select claim_ordini_nts(5) c`)).rows[0].c;
  assert(ancora.length === 0, "claim: lo stesso ordine non va preso due volte");
  const sbagliato = (await db.query<{ ok: boolean }>(`select passa_stato_nts(1, '{da_inviare}', 'in_frontiera') ok`)).rows[0].ok;
  assert(sbagliato === false, "passa_stato_nts da stato sbagliato non deve cambiare nulla");
  // prova a secco: torna da_inviare e non viene ripreso in modalità prova, sì in modalità reale
  await db.query(`select passa_stato_nts(1, '{in_invio}', 'da_inviare', p_evento => 'prova_ok', p_prova_ok => true)`);
  assert((await db.query<{ c: Claim }>(`select claim_ordini_nts(5, true) c`)).rows[0].c.length === 0, "prova: ordine già provato non va ripreso");
  assert((await db.query<{ c: Claim }>(`select claim_ordini_nts(5, false) c`)).rows[0].c.length === 1, "reale: ordine provato va preso");
  await db.query(`select passa_stato_nts(1, '{in_invio}', 'in_frontiera', p_id_frontiera => 900)`);
  await db.query(`select passa_stato_nts(1, '{in_frontiera}', 'in_nts', p_numero_nts => 4321)`);
  const fin = (await db.query<{ stato: string; stato_nts: string; numero_nts: number; id_frontiera: string; tentativi_nts: number }>(`select stato, stato_nts, numero_nts, id_frontiera, tentativi_nts from ordini where id = 1`)).rows[0];
  assert(fin.stato === "inserito_nts" && fin.stato_nts === "in_nts" && fin.numero_nts === 4321 && Number(fin.id_frontiera) === 900 && fin.tentativi_nts === 2, `in_nts: ${JSON.stringify(fin)}`);
  const nlog = (await db.query<{ n: string }>(`select count(*) n from log_nts where ordine_id = 1`)).rows[0];
  assert(Number(nlog.n) === 5, `log_nts: ${nlog.n} righe invece di 5`);
  // cliente demo: niente coda NTS
  await db.exec(`
    insert into clienti (codice_nts, ragione_sociale, demo) values ('DEMO1', 'Demo', true);
    insert into ordini (cliente_id, stato) values (3, 'bozza');
    insert into righe_ordine (ordine_id, cod_dav, descrizione, quantita) select id, 'ALTRO', 'ALTRO', 1 from ordini where cliente_id = 3;
  `);
  await db.query(`select * from conferma_ordine((select id from ordini where cliente_id = 3), current_date + 1, null)`);
  const demo = (await db.query<{ s: string | null; r: string | null }>(`select stato_nts s, riferimento_nts r from ordini where cliente_id = 3`)).rows[0];
  assert(demo.s === null && demo.r !== null, `ordine demo fuori da NTS: ${JSON.stringify(demo)}`);

  // RLS: cliente C001 (utente u1) vede solo le proprie condizioni, non quelle di C002
  await db.exec(`
    insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');
    insert into utenti (id, cliente_id, ruolo) values ('11111111-1111-1111-1111-111111111111', 1, 'cliente'),
                                                     ('22222222-2222-2222-2222-222222222222', null, 'admin');
    insert into condizioni_cliente (cliente_id, tipo, sconto1) values (2, 'generale', 50);
    grant usage on schema public to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant usage on all sequences in schema public to authenticated;
  `);
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);`);
  const vis = await db.query<{ n: string }>(`select count(*) n from condizioni_cliente`);
  assert(Number(vis.rows[0].n) === 3, `RLS cliente vede ${vis.rows[0].n} condizioni invece di 3`);
  const cli = await db.query<{ n: string }>(`select count(*) n from clienti`);
  assert(Number(cli.rows[0].n) === 1, `RLS cliente vede ${cli.rows[0].n} clienti invece di 1`);
  let negato = false;
  try {
    await db.query(`select * from prezzo_cliente(2, 'ALTRO')`);
  } catch {
    negato = true;
  }
  assert(negato, "prezzo_cliente di un altro cliente deve essere negato");
  let negatoBlocco = false;
  try {
    await db.query(`select * from prezzi_cliente(2, '{ALTRO}')`);
  } catch {
    negatoBlocco = true;
  }
  assert(negatoBlocco, "prezzi_cliente di un altro cliente deve essere negato");
  const mio = (await db.query<P>(`select * from prezzo_cliente(1, 'ALTRO')`)).rows[0];
  assert(mio.origine === "generale", "prezzo_cliente proprio deve funzionare con RLS");
  // ordine proprio: ok; ordine per un altro cliente: negato
  await db.query(`insert into ordini (cliente_id, stato) values (1, 'inviato')`);
  let ordineNegato = false;
  try {
    await db.query(`insert into ordini (cliente_id, stato) values (2, 'inviato')`);
  } catch {
    ordineNegato = true;
  }
  assert(ordineNegato, "ordine per un altro cliente deve essere negato");
  // il cliente non può toccare le colonne NTS, nemmeno sul proprio carrello
  await db.exec(`reset role; insert into ordini (cliente_id, stato) values (1, 'bozza'); set role authenticated;`);
  let ntsNegato = false;
  try {
    await db.query(`update ordini set stato_nts = 'in_nts' where cliente_id = 1 and stato = 'bozza'`);
  } catch {
    ntsNegato = true;
  }
  assert(ntsNegato, "cliente che scrive stato_nts deve essere negato");
  let claimNegato = false;
  try {
    await db.query(`select claim_ordini_nts(5)`);
  } catch {
    claimNegato = true;
  }
  assert(claimNegato, "claim_ordini_nts riservato al service role");

  await db.exec(`select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);`);
  const adm = await db.query<{ n: string }>(`select count(*) n from clienti`);
  assert(Number(adm.rows[0].n) === 3, `RLS admin vede ${adm.rows[0].n} clienti invece di 3`); // C001, C002, DEMO1
  await db.exec(`reset role;`);

  // Avviso "connettore muto" (0008): job ogni minuto, email via pg_net solo dopo 5 minuti di silenzio
  const job = (await db.query<{ schedule: string; command: string }>(`select schedule, command from cron.job where jobname = 'connettore-nts-muto'`)).rows[0];
  assert(job?.schedule === "* * * * *" && job.command.includes("controlla_connettore_nts"), `job pg_cron: ${JSON.stringify(job)}`);
  const controlla = async () => (await db.query<{ e: string }>(`select public.controlla_connettore_nts() e`)).rows[0].e;
  const chiamate = async () => Number((await db.query<{ n: string }>(`select count(*) n from net.chiamate`)).rows[0].n);
  assert((await controlla()) === "connettore mai avviato: nessun avviso", "senza heartbeat nessun avviso");
  await db.exec(`insert into impostazioni (chiave, valore) values ('connettore_nts', '{"ultimo_giro": "2000-01-01T00:00:00Z", "modalita": "prova"}')`);
  const hb = (await db.query<{ r: string | null }>(`select valore->>'ricevuto_il' r from impostazioni where chiave = 'connettore_nts'`)).rows[0];
  assert(hb.r !== null, "heartbeat: ricevuto_il messo dal database");
  assert((await controlla()) === "connettore attivo", "heartbeat appena ricevuto (vale l'ora del database, non ultimo_giro)");
  const zittisci = (min: number) =>
    db.exec(`alter table impostazioni disable trigger impostazioni_heartbeat;
             update impostazioni set valore = jsonb_set(valore, '{ricevuto_il}', to_jsonb(now() - interval '${min} minutes')) where chiave = 'connettore_nts';
             alter table impostazioni enable trigger impostazioni_heartbeat;`);
  await zittisci(4);
  assert((await controlla()) === "connettore attivo", "4 minuti: ancora attivo");
  await zittisci(6);
  assert((await controlla()) === "chiave Resend mancante" && (await chiamate()) === 0, "senza chiave Resend nessuna chiamata");
  await db.exec(`delete from impostazioni where chiave = 'connettore_nts_allarme'; insert into vault.decrypted_secrets values ('resend_api_key', 're_prova')`);
  assert((await controlla()) === "avviso inviato" && (await chiamate()) === 1, "6 minuti: avviso");
  const c1 = (await db.query<{ url: string; body: { to: string[]; subject: string; from: string }; headers: { Authorization: string } }>(`select url, body, headers from net.chiamate`)).rows[0];
  assert(c1.url === "https://api.resend.com/emails" && c1.headers.Authorization === "Bearer re_prova" && c1.body.to[0] === "info@davsnc.it" && c1.body.from === "DAV Ordini <ordini@davsnc.it>", `email: ${JSON.stringify(c1)}`);
  assert((await controlla()) === "silenzio già segnalato" && (await chiamate()) === 1, "stesso silenzio: niente seconda email");
  // avviso partito 10 minuti fa, poi il connettore riparte e dopo un po' tace di nuovo
  await db.exec(`update impostazioni set valore = jsonb_set(valore, '{inviato_il}', to_jsonb(now() - interval '10 minutes')) where chiave = 'connettore_nts_allarme'`);
  await db.exec(`update impostazioni set valore = valore where chiave = 'connettore_nts'`);
  assert((await controlla()) === "connettore attivo", "connettore ripartito");
  await zittisci(7);
  assert((await controlla()) === "avviso inviato" && (await chiamate()) === 2, "nuovo silenzio dopo la ripartenza: nuova email");
  await db.exec(`update impostazioni set valore = jsonb_set(valore, '{inviato_il}', to_jsonb(now() - interval '61 minutes')) where chiave = 'connettore_nts_allarme'`);
  await zittisci(90);
  assert((await controlla()) === "avviso inviato" && (await chiamate()) === 3, "silenzio lungo: promemoria dopo un'ora");

  // Documenti e scadenze (0009): l'ordine SHOP-000001 (in NTS) passa a consegnato quando arriva il suo DDT
  await db.exec(`
    insert into documenti (chiave_nts, cliente_id, tipo, anno, numero, data_doc, imponibile, iva, totale)
      values ('B/2026//100', 1, 'ddt', 2026, 100, '2026-10-27', 100, 10, 110),
             ('A/2026//50', 1, 'fattura', 2026, 50, '2026-10-31', 100, 10, 110),
             ('B/2026//101', 2, 'ddt', 2026, 101, '2026-10-27', 200, 20, 220),
             ('B/2026//102', 1, 'ddt', 2026, 102, '2026-10-28', 5, 0.5, 5.5);
    update documenti set presente_in_nts = false where chiave_nts = 'B/2026//102';
    insert into righe_documento (documento_id, riga, cod_dav, descrizione, quantita, importo, rif_ordine_numero, rif_ordine_shop)
      values (1, 1, 'FARMIR', 'FARCITURA MIRTILLI KG.6 IR', 2, 100, 4321, 'SHOP-000001'),
             (3, 1, 'ALTRO', 'ARTICOLO', 1, 200, null, null);
    insert into riepilogo_iva (documento_id, codice_iva, aliquota, imponibile, imposta) values (2, '10', 10, 100, 10), (3, '10', 10, 200, 20);
    insert into scadenze (chiave_nts, cliente_id, documento_id, data_scadenza, importo, residuo, stato)
      values ('S1', 1, 2, '2026-10-31', 110, 110, 'aperta'), ('S2', 2, 3, '2026-10-31', 220, 220, 'insoluta');
  `);
  const consegnato = (await db.query<{ stato: string }>(`select stato from ordini where id = 1`)).rows[0];
  assert(consegnato.stato === "consegnato", `DDT con rif. SHOP-000001: ordine ${consegnato.stato} invece di consegnato`);
  const logConsegna = (await db.query<{ d: string }>(`select dettaglio d from log_nts where ordine_id = 1 and evento = 'consegnato'`)).rows[0];
  assert(logConsegna?.d === "DDT 100 del 27/10/2026", `log consegna: ${JSON.stringify(logConsegna)}`);
  const tocca = (await db.query<{ t: string }>(`update scadenze set stato = 'pagata', residuo = 0 where chiave_nts = 'S1' returning aggiornato_il::text t`)).rows[0];
  assert(tocca.t, "scadenze: aggiornato_il");
  await db.exec(`update scadenze set stato = 'aperta', residuo = 110 where chiave_nts = 'S1'`);

  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);`);
  const docC1 = (await db.query<{ chiave_nts: string }>(`select chiave_nts from documenti order by chiave_nts`)).rows.map((r) => r.chiave_nts);
  assert(docC1.join(",") === "A/2026//50,B/2026//100", `RLS documenti cliente 1: ${docC1.join(",")} (niente documenti altrui né spariti da NTS)`);
  const righeC1 = Number((await db.query<{ n: string }>(`select count(*) n from righe_documento`)).rows[0].n);
  assert(righeC1 === 1, `RLS righe_documento cliente 1: ${righeC1}`);
  const ivaC1 = Number((await db.query<{ n: string }>(`select count(*) n from riepilogo_iva`)).rows[0].n);
  assert(ivaC1 === 1, `RLS riepilogo_iva cliente 1: ${ivaC1}`);
  const scadC1 = (await db.query<{ chiave_nts: string }>(`select chiave_nts from scadenze`)).rows.map((r) => r.chiave_nts);
  assert(scadC1.join(",") === "S1", `RLS scadenze cliente 1: ${scadC1.join(",")}`);
  const altrui = await db.query(`select id from documenti where chiave_nts = 'B/2026//101'`);
  assert(altrui.rows.length === 0, "documento di un altro cliente per chiave: negato");
  let scritturaNegata = false;
  try {
    await db.query(`update documenti set totale = 0 where cliente_id = 1`);
    scritturaNegata = Number((await db.query<{ n: string }>(`select count(*) n from documenti where totale = 0`)).rows[0].n) === 0;
  } catch {
    scritturaNegata = true;
  }
  assert(scritturaNegata, "il cliente non può modificare i documenti");
  const syncC1 = Number((await db.query<{ n: string }>(`select count(*) n from sync_stato`)).rows[0].n);
  assert(syncC1 === 0, "sync_stato riservato all'admin");
  await db.exec(`select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);`);
  const docAdmin = Number((await db.query<{ n: string }>(`select count(*) n from documenti`)).rows[0].n);
  assert(docAdmin === 4, `admin vede tutti i documenti, anche spariti da NTS: ${docAdmin}`);
  await db.exec(`reset role;`);

  console.log("Tutti i controlli superati.");
  await db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
