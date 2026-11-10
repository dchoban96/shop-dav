/**
 * Livello dati di clienti, carrello e ordini (STRUTTURA, sezione 7).
 * Il carrello è l'ordine del cliente in stato `bozza`: persiste tra dispositivi.
 * FASE DEMO: service role lato server, chiamato solo dentro `(cliente)`.
 */
import { supabaseAdmin } from "@/lib/supabase/admin";

export type Cliente = {
  id: number;
  codice_nts: string;
  ragione_sociale: string;
  email: string | null;
  giorni_consegna: number[];
  demo: boolean;
};

export type StatoOrdine = "bozza" | "inviato" | "confermato" | "inserito_nts" | "consegnato" | "annullato";

/** Avanzamento verso NTS (connettore in LAN). null = ordine fuori dal flusso (demo, carrello, precedente). */
export type StatoNts = "da_inviare" | "in_invio" | "in_frontiera" | "in_nts" | "da_verificare" | "errore" | "manuale";

export type Ordine = {
  id: number;
  numero: number;
  stato: StatoOrdine;
  data_consegna_richiesta: string | null;
  note: string | null;
  totale_netto: number;
  creato_il: string;
  email_inviata_il: string | null;
  stato_nts: StatoNts | null;
  riferimento_nts: string | null;
  numero_nts: number | null;
  id_frontiera: number | null;
  errore_nts: string | null;
  tentativi_nts: number;
  in_invio_il: string | null;
  in_frontiera_il: string | null;
  in_nts_il: string | null;
};

export type RigaOrdine = {
  id: number;
  cod_dav: string;
  descrizione: string;
  quantita: number;
  um: string | null;
  prezzo_listino: number | null;
  sconto1: number;
  sconto2: number;
  prezzo_accordato: number | null;
  prezzo_finale: number | null;
  note: string | null;
  famiglia: string | null;
  marchio: string | null;
  logo_marchio: string | null;
  foto_path: string | null;
};

export type VoceStorico = {
  cod_dav: string;
  descrizione: string;
  um: string | null;
  pezzi_confezione: number | null;
  famiglia: string | null;
  marchio: string | null;
  logo_marchio: string | null;
  foto_path: string | null;
  ultima_data: string | null;
  ultima_quantita: number | null;
  n_ordini_12m: number;
  qta_12m: number;
  fatturato_12m: number;
};

/** Etichette per l'ufficio. */
export const ETICHETTA_STATO: Record<StatoOrdine, string> = {
  bozza: "Bozza",
  inviato: "Inviato all’ufficio",
  confermato: "Confermato",
  inserito_nts: "Inserito in gestionale",
  consegnato: "Consegnato",
  annullato: "Annullato",
};

/** Etichette per il cliente: stato semplificato, senza gestionale né numeri NTS. */
export const ETICHETTA_CLIENTE: Record<StatoOrdine, string> = {
  bozza: "Bozza",
  inviato: "Ordine ricevuto",
  confermato: "Ordine preso in carico",
  inserito_nts: "Ordine preso in carico",
  consegnato: "Consegnato",
  annullato: "Annullato",
};

type Forn = { nome_breve: string | null; nome_nts: string; logo_path: string | null; attivo: boolean };

const CAMPI_RIGA =
  "id, cod_dav, descrizione, quantita, um, prezzo_listino, sconto1, sconto2, prezzo_accordato, prezzo_finale, note, " +
  "articolo:articoli(foto_path, famiglia:famiglie(nome), fornitore:fornitori(nome_breve, nome_nts, logo_path, attivo))";

type RigaDb = {
  id: number; cod_dav: string; descrizione: string; quantita: string | number; um: string | null;
  prezzo_listino: string | null; sconto1: string; sconto2: string; prezzo_accordato: string | null; prezzo_finale: string | null; note: string | null;
  articolo: { foto_path: string | null; famiglia: { nome: string } | { nome: string }[] | null; fornitore: Forn | Forn[] | null } | null;
};

const num = (v: string | number | null | undefined): number | null => (v === null || v === undefined ? null : Number(v));
const uno = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
/** Fornitore disattivato = marchio tolto dal sito: la riga resta, senza nome né logo. */
const marchioVisibile = (f: Forn | null): Forn | null => (f?.attivo ? f : null);

function normalizzaRiga(r: RigaDb): RigaOrdine {
  const fam = uno(r.articolo?.famiglia);
  const forn = marchioVisibile(uno(r.articolo?.fornitore));
  return {
    id: r.id, cod_dav: r.cod_dav, descrizione: r.descrizione, quantita: Number(r.quantita), um: r.um,
    prezzo_listino: num(r.prezzo_listino), sconto1: Number(r.sconto1 ?? 0), sconto2: Number(r.sconto2 ?? 0),
    prezzo_accordato: num(r.prezzo_accordato), prezzo_finale: num(r.prezzo_finale), note: r.note,
    famiglia: fam?.nome ?? null, marchio: forn?.nome_breve || forn?.nome_nts || null, logo_marchio: forn?.logo_path ?? null, foto_path: r.articolo?.foto_path ?? null,
  };
}

function normalizzaOrdine(o: Record<string, unknown>): Ordine {
  return {
    id: Number(o.id), numero: Number(o.numero), stato: o.stato as StatoOrdine,
    data_consegna_richiesta: (o.data_consegna_richiesta as string | null) ?? null, note: (o.note as string | null) ?? null,
    totale_netto: Number(o.totale_netto ?? 0), creato_il: String(o.creato_il), email_inviata_il: (o.email_inviata_il as string | null) ?? null,
    ...campiNts(o),
  };
}

/** Colonne NTS dell'ordine (migrazione 0007); assenti prima della migrazione → valori vuoti. */
export function campiNts(o: Record<string, unknown>) {
  const testo = (v: unknown) => (v === null || v === undefined ? null : String(v));
  const numero = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    stato_nts: (o.stato_nts as StatoNts | null | undefined) ?? null,
    riferimento_nts: testo(o.riferimento_nts),
    numero_nts: numero(o.numero_nts),
    id_frontiera: numero(o.id_frontiera),
    errore_nts: testo(o.errore_nts),
    tentativi_nts: Number(o.tentativi_nts ?? 0),
    in_invio_il: testo(o.in_invio_il),
    in_frontiera_il: testo(o.in_frontiera_il),
    in_nts_il: testo(o.in_nts_il),
  };
}

// Clienti ---------------------------------------------------------------------

/** Cliente per codice NTS. Con `creaDemo`, se non esiste viene creato marcato `demo` (solo dal login). */
export async function clientePerCodice(codice: string, creaDemo = false): Promise<Cliente | null> {
  const db = supabaseAdmin();
  const campi = "id, codice_nts, ragione_sociale, email, giorni_consegna, demo";
  const { data, error } = await db.from("clienti").select(campi).eq("codice_nts", codice).maybeSingle();
  if (error) throw new Error(`clientePerCodice: ${error.message}`);
  if (data) return data as Cliente;
  if (!creaDemo) return null;
  const { data: nuovo, error: e2 } = await db
    .from("clienti")
    .insert({ codice_nts: codice, ragione_sociale: `Cliente ${codice} (accesso demo)`, demo: true })
    .select(campi)
    .single();
  if (e2) {
    // Layout e pagina chiamano in parallelo: se l'altra chiamata ha già creato il cliente, rileggilo.
    if (e2.code === "23505") {
      const { data: esistente, error: e3 } = await db.from("clienti").select(campi).eq("codice_nts", codice).maybeSingle();
      if (e3) throw new Error(`clientePerCodice: ${e3.message}`);
      if (esistente) return esistente as Cliente;
    }
    throw new Error(`clientePerCodice: ${e2.message}`);
  }
  return nuovo as Cliente;
}

// Carrello --------------------------------------------------------------------

export async function carrelloBozza(clienteId: number, crea: boolean): Promise<Ordine | null> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("ordini").select("*").eq("cliente_id", clienteId).eq("stato", "bozza").order("id", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`carrelloBozza: ${error.message}`);
  if (data) return normalizzaOrdine(data);
  if (!crea) return null;
  const { data: nuovo, error: e2 } = await db.from("ordini").insert({ cliente_id: clienteId, stato: "bozza" }).select("*").single();
  if (e2) throw new Error(`carrelloBozza: ${e2.message}`);
  return normalizzaOrdine(nuovo);
}

export async function righeOrdine(ordineId: number): Promise<RigaOrdine[]> {
  const { data, error } = await supabaseAdmin().from("righe_ordine").select(CAMPI_RIGA).eq("ordine_id", ordineId).order("id");
  if (error) throw new Error(`righeOrdine: ${error.message}`);
  return ((data ?? []) as unknown as RigaDb[]).map(normalizzaRiga);
}

export async function contaCarrello(clienteId: number): Promise<number> {
  const bozza = await carrelloBozza(clienteId, false);
  if (!bozza) return 0;
  const { count, error } = await supabaseAdmin().from("righe_ordine").select("id", { count: "exact", head: true }).eq("ordine_id", bozza.id);
  if (error) throw new Error(`contaCarrello: ${error.message}`);
  return count ?? 0;
}

type Prezzo = { listino: number | null; sconto1: number; sconto2: number; prezzo_accordato: number | null; prezzo_finale: number | null; origine: string | null };

/**
 * Origine restituita da prezzo_cliente (migrazione 0011) quando lo sconto del cliente supera il 20 % e non c'è
 * un prezzo speciale: il cliente vede il listino e questo messaggio.
 */
export const SCONTO_DA_VERIFICARE = "sconto_da_verificare";
export const MESSAGGIO_SCONTISTICA = "Scontistica non disponibile: chiedi info all’agente o all’ufficio DAV";

export async function prezzoCliente(clienteId: number, codDav: string): Promise<Prezzo | null> {
  const { data, error } = await supabaseAdmin().rpc("prezzo_cliente", { p_cliente_id: clienteId, p_cod_dav: codDav });
  if (error) throw new Error(`prezzoCliente: ${error.message}`);
  const p = Array.isArray(data) ? data[0] : data;
  if (!p) return null;
  return { listino: num(p.listino), sconto1: Number(p.sconto1 ?? 0), sconto2: Number(p.sconto2 ?? 0), prezzo_accordato: num(p.prezzo_accordato), prezzo_finale: num(p.prezzo_finale), origine: p.origine ?? null };
}

export type PrezzoCatalogo = { listino: number | null; prezzo_finale: number | null; origine: string };

/**
 * Prezzo finale del cliente per una lista di articoli (griglia catalogo, scheda).
 * Una sola chiamata; gli articoli sconosciuti non compaiono nella mappa.
 */
export async function prezziCliente(clienteId: number, codDav: string[]): Promise<Map<string, PrezzoCatalogo>> {
  const mappa = new Map<string, PrezzoCatalogo>();
  const codici = [...new Set(codDav)].filter(Boolean);
  if (codici.length === 0) return mappa;
  const { data, error } = await supabaseAdmin().rpc("prezzi_cliente", { p_cliente_id: clienteId, p_cod_dav: codici });
  if (error) throw new Error(`prezziCliente: ${error.message}`);
  type R = { cod_dav: string; listino: string | null; prezzo_finale: string | null; origine: string };
  for (const r of (data ?? []) as R[]) {
    mappa.set(r.cod_dav, { listino: num(r.listino), prezzo_finale: num(r.prezzo_finale), origine: r.origine });
  }
  return mappa;
}

export async function aggiungiAlCarrello(clienteId: number, codDav: string, quantita: number): Promise<void> {
  if (!(quantita > 0)) return;
  const db = supabaseAdmin();
  const { data: art, error: ea } = await db.from("articoli").select("cod_dav, descrizione_nts, descrizione_pulita, um, attivo").eq("cod_dav", codDav).maybeSingle();
  if (ea) throw new Error(`aggiungiAlCarrello: ${ea.message}`);
  if (!art || !art.attivo) throw new Error(`Articolo ${codDav} non disponibile`);
  const bozza = (await carrelloBozza(clienteId, true))!;
  const { data: esistente } = await db.from("righe_ordine").select("id, quantita").eq("ordine_id", bozza.id).eq("cod_dav", codDav).maybeSingle();
  if (esistente) {
    const { error } = await db.from("righe_ordine").update({ quantita: Number(esistente.quantita) + quantita }).eq("id", esistente.id);
    if (error) throw new Error(`aggiungiAlCarrello: ${error.message}`);
    return;
  }
  const p = await prezzoCliente(clienteId, codDav);
  const { error } = await db.from("righe_ordine").insert({
    ordine_id: bozza.id, cod_dav: codDav, descrizione: art.descrizione_pulita ?? art.descrizione_nts, quantita, um: art.um,
    prezzo_listino: p?.listino ?? null, sconto1: p?.sconto1 ?? 0, sconto2: p?.sconto2 ?? 0, prezzo_accordato: p?.prezzo_accordato ?? null, prezzo_finale: p?.prezzo_finale ?? null,
  });
  if (error) throw new Error(`aggiungiAlCarrello: ${error.message}`);
}

async function rigaDelCliente(clienteId: number, rigaId: number): Promise<{ id: number; quantita: number } | null> {
  const bozza = await carrelloBozza(clienteId, false);
  if (!bozza) return null;
  const { data } = await supabaseAdmin().from("righe_ordine").select("id, quantita").eq("id", rigaId).eq("ordine_id", bozza.id).maybeSingle();
  return data ? { id: data.id, quantita: Number(data.quantita) } : null;
}

export async function aggiornaRiga(clienteId: number, rigaId: number, mod: { quantita?: number; note?: string | null }): Promise<void> {
  const riga = await rigaDelCliente(clienteId, rigaId);
  if (!riga) return;
  const db = supabaseAdmin();
  if (mod.quantita !== undefined && mod.quantita <= 0) {
    await db.from("righe_ordine").delete().eq("id", riga.id);
    return;
  }
  const patch: Record<string, unknown> = {};
  if (mod.quantita !== undefined) patch.quantita = mod.quantita;
  if (mod.note !== undefined) patch.note = mod.note && mod.note.trim() ? mod.note.trim() : null;
  if (Object.keys(patch).length === 0) return;
  const { error } = await db.from("righe_ordine").update(patch).eq("id", riga.id);
  if (error) throw new Error(`aggiornaRiga: ${error.message}`);
}

export async function rimuoviRiga(clienteId: number, rigaId: number): Promise<void> {
  const riga = await rigaDelCliente(clienteId, rigaId);
  if (riga) await supabaseAdmin().from("righe_ordine").delete().eq("id", riga.id);
}

export async function confermaOrdine(clienteId: number, dataConsegna: string, note: string): Promise<Ordine> {
  const bozza = await carrelloBozza(clienteId, false);
  if (!bozza) throw new Error("Il carrello è vuoto");
  const { data, error } = await supabaseAdmin().rpc("conferma_ordine", { p_ordine_id: bozza.id, p_data_consegna: dataConsegna, p_note: note });
  if (error) throw new Error(error.message.replace(/^conferma_ordine: /, ""));
  return normalizzaOrdine(Array.isArray(data) ? data[0] : data);
}

export async function segnaEmailInviata(ordineId: number): Promise<void> {
  await supabaseAdmin().from("ordini").update({ email_inviata_il: new Date().toISOString() }).eq("id", ordineId);
}

// Ordini ----------------------------------------------------------------------

export async function ordiniCliente(clienteId: number): Promise<Ordine[]> {
  const { data, error } = await supabaseAdmin().from("ordini").select("*").eq("cliente_id", clienteId).neq("stato", "bozza").order("creato_il", { ascending: false }).limit(100);
  if (error) throw new Error(`ordiniCliente: ${error.message}`);
  return (data ?? []).map(normalizzaOrdine);
}

export async function ordinePerId(clienteId: number, id: number): Promise<{ ordine: Ordine; righe: RigaOrdine[] } | null> {
  const { data, error } = await supabaseAdmin().from("ordini").select("*").eq("id", id).eq("cliente_id", clienteId).neq("stato", "bozza").maybeSingle();
  if (error) throw new Error(`ordinePerId: ${error.message}`);
  if (!data) return null;
  return { ordine: normalizzaOrdine(data), righe: await righeOrdine(Number(data.id)) };
}

// Storico (home, sezione "I tuoi articoli") -----------------------------------

export async function storicoCliente(clienteId: number, limite = 40): Promise<VoceStorico[]> {
  const { data, error } = await supabaseAdmin()
    .from("storico_acquisti")
    .select("cod_dav, ultima_data, ultima_quantita, n_ordini_12m, qta_12m, fatturato_12m, articolo:articoli(descrizione_nts, descrizione_pulita, um, pezzi_confezione, foto_path, attivo, famiglia:famiglie(nome), fornitore:fornitori(nome_breve, nome_nts, logo_path, attivo))")
    .eq("cliente_id", clienteId)
    .order("n_ordini_12m", { ascending: false })
    .order("ultima_data", { ascending: false })
    .limit(limite);
  if (error) throw new Error(`storicoCliente: ${error.message}`);
  type Riga = { cod_dav: string; ultima_data: string | null; ultima_quantita: string | null; n_ordini_12m: number; qta_12m: string; fatturato_12m: string; articolo: { descrizione_nts: string; descrizione_pulita: string | null; um: string | null; pezzi_confezione: string | null; foto_path: string | null; attivo: boolean; famiglia: { nome: string } | { nome: string }[] | null; fornitore: Forn | Forn[] | null } | null };
  return ((data ?? []) as unknown as Riga[])
    .filter((r) => r.articolo?.attivo)
    .map((r) => {
      const fam = uno(r.articolo?.famiglia);
      const forn = marchioVisibile(uno(r.articolo?.fornitore));
      return {
        cod_dav: r.cod_dav, descrizione: r.articolo?.descrizione_pulita ?? r.articolo?.descrizione_nts ?? r.cod_dav, um: r.articolo?.um ?? null, pezzi_confezione: num(r.articolo?.pezzi_confezione),
        famiglia: fam?.nome ?? null, marchio: forn?.nome_breve || forn?.nome_nts || null, logo_marchio: forn?.logo_path ?? null, foto_path: r.articolo?.foto_path ?? null,
        ultima_data: r.ultima_data, ultima_quantita: num(r.ultima_quantita), n_ordini_12m: r.n_ordini_12m, qta_12m: Number(r.qta_12m), fatturato_12m: Number(r.fatturato_12m),
      };
    });
}

export type Riepilogo12m = {
  fatturato: number;
  nOrdini: number;
  nArticoli: number;
  ultimaData: string | null;
  /** I primi per spesa, con i numeri dei 12 mesi. */
  articoli: { cod_dav: string; descrizione: string; um: string | null; n_ordini_12m: number; qta_12m: number; fatturato_12m: number }[];
  /** Quanti altri articoli acquistati non sono in lista. */
  altri: number;
};

/** Statistiche degli ultimi 12 mesi dal data.json del cruscotto (storico_acquisti), per il pannello della home. */
export async function riepilogo12m(clienteId: number, limite = 12): Promise<Riepilogo12m> {
  const { data, error } = await supabaseAdmin()
    .from("storico_acquisti")
    .select("cod_dav, ultima_data, n_ordini_12m, qta_12m, fatturato_12m, articolo:articoli(descrizione_nts, descrizione_pulita, um)")
    .eq("cliente_id", clienteId)
    .gt("n_ordini_12m", 0)
    .order("fatturato_12m", { ascending: false });
  if (error) throw new Error(`riepilogo12m: ${error.message}`);
  type Riga = { cod_dav: string; ultima_data: string | null; n_ordini_12m: number; qta_12m: string; fatturato_12m: string; articolo: { descrizione_nts: string; descrizione_pulita: string | null; um: string | null } | { descrizione_nts: string; descrizione_pulita: string | null; um: string | null }[] | null };
  const righe = (data ?? []) as unknown as Riga[];
  let fatturato = 0, nOrdini = 0, ultimaData: string | null = null;
  for (const r of righe) {
    fatturato += Number(r.fatturato_12m);
    nOrdini += r.n_ordini_12m;
    if (r.ultima_data && (!ultimaData || r.ultima_data > ultimaData)) ultimaData = r.ultima_data;
  }
  return {
    fatturato: Math.round(fatturato * 100) / 100,
    nOrdini,
    nArticoli: righe.length,
    ultimaData,
    articoli: righe.slice(0, limite).map((r) => {
      const a = uno(r.articolo);
      return { cod_dav: r.cod_dav, descrizione: a?.descrizione_pulita ?? a?.descrizione_nts ?? r.cod_dav, um: a?.um ?? null, n_ordini_12m: r.n_ordini_12m, qta_12m: Number(r.qta_12m), fatturato_12m: Number(r.fatturato_12m) };
    }),
    altri: Math.max(0, righe.length - limite),
  };
}

// Consegna --------------------------------------------------------------------

export const GIORNI_SETTIMANA = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];

/** Primo giorno di consegna dopo oggi (giorni: 1 = lunedì … 6 = sabato). */
export function prossimaConsegna(giorni: number[], da = new Date()): string {
  const validi = giorni.length ? giorni : [1, 2, 3, 4, 5];
  const d = new Date(Date.UTC(da.getFullYear(), da.getMonth(), da.getDate()));
  for (let i = 1; i <= 14; i++) {
    d.setUTCDate(d.getUTCDate() + 1);
    const iso = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
    if (validi.includes(iso)) return d.toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 10);
}

export function domani(da = new Date()): string {
  const d = new Date(Date.UTC(da.getFullYear(), da.getMonth(), da.getDate() + 1));
  return d.toISOString().slice(0, 10);
}

export function formattaData(iso: string | null, opzioni: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" }): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("it-IT", opzioni).format(new Date(iso));
}
