/**
 * Documenti del cliente da NTS (DDT, fatture, note di credito), righe, riepilogo IVA, scadenze
 * e stato della sincronizzazione (migrazione 0009). Li scrive solo il connettore in LAN.
 *
 * Come il resto dell'area cliente: service role lato server, ogni lettura filtra per cliente_id.
 * Con `clienteId` le funzioni restituiscono solo i documenti di quel cliente ancora presenti in NTS;
 * con `null` (area ufficio, dopo il controllo admin) anche quelli spariti da NTS.
 *
 * Prima che la migrazione 0009 sia applicata le tabelle non esistono: le funzioni restituiscono
 * `disponibile: false` invece di far cadere la pagina.
 */
import { supabaseAdmin } from "@/lib/supabase/admin";

export type TipoDocumento = "ddt" | "fattura" | "nota_credito";
export type StatoScadenza = "aperta" | "pagata" | "insoluta";

export type Documento = {
  id: number;
  chiave_nts: string;
  cliente_id: number;
  tipo: TipoDocumento;
  sottotipo: string | null;
  anno: number;
  serie: string;
  numero: number;
  data_doc: string;
  destinazione: string | null;
  agente_desc: string | null;
  pagamento_codice: string | null;
  pagamento_desc: string | null;
  imponibile: number;
  iva: number;
  totale: number;
  trasporto_a_cura: string | null;
  causale_trasporto: string | null;
  aspetto_esteriore: string | null;
  vettore: string | null;
  totale_colli: number | null;
  peso: number | null;
  note: string | null;
  presente_in_nts: boolean;
  aggiornato_il: string;
};

export type RigaDocumento = {
  id: number;
  riga: number;
  tipo_riga: "articolo" | "rif_ddt" | "rif_ordine" | "nota";
  cod_dav: string | null;
  /** Descrizione della riga NTS (con ART. e fornitore, o il testo libero dell'articolo M). */
  descrizione: string | null;
  /** Descrizione pulita del catalogo, se l'articolo è nello shop: è quella da mostrare nelle pagine. */
  descrizione_shop: string | null;
  /** Articolo attivo nel catalogo online: si può riordinare e linkare. */
  in_catalogo: boolean;
  cod_fornitore: string | null;
  um: string | null;
  quantita: number | null;
  prezzo: number | null;
  sconti_testo: string | null;
  importo: number | null;
  codice_iva: string | null;
  aliquota_iva: number | null;
  lotto: string | null;
  scadenza_lotto: string | null;
  rif_ddt_numero: number | null;
  rif_ddt_data: string | null;
  rif_ordine_numero: number | null;
  rif_ordine_data: string | null;
  rif_ordine_shop: string | null;
};

export type VoceIva = { codice_iva: string; descrizione: string | null; aliquota: number | null; imponibile: number; imposta: number };

export type DocumentoBreve = { id: number; tipo: TipoDocumento; numero: number; data_doc: string; totale: number };

export type Scadenza = {
  id: number;
  data_scadenza: string;
  importo: number;
  residuo: number;
  stato: StatoScadenza;
  tipo_pagamento: string | null;
  /** Aperta (o insoluta) con data già passata. */
  scaduta: boolean;
  documento: DocumentoBreve | null;
};

/** Stato di pagamento di una fattura, ricavato dalle sue scadenze. */
export type StatoPagamento = "pagata" | "da_pagare" | "scaduta" | null;

export type DocumentoElenco = Documento & { pagamento: StatoPagamento };

export type DettaglioDocumento = {
  documento: Documento;
  righe: RigaDocumento[];
  iva: VoceIva[];
  scadenze: Scadenza[];
  /** Fattura: i DDT da cui nasce, nell'ordine in cui compaiono. DDT: vuoto. */
  ddt: DocumentoBreve[];
  /** DDT: la fattura che lo comprende, se già emessa. */
  fattura: DocumentoBreve | null;
  /** Ordini dello shop collegati (riferimento SHOP-… → id e numero dell'ordine). */
  ordiniShop: { riferimento: string; id: number; numero: number }[];
};

export const ETICHETTA_TIPO: Record<TipoDocumento, string> = { ddt: "DDT", fattura: "Fattura", nota_credito: "Nota di credito" };

export const ETICHETTA_PAGAMENTO: Record<Exclude<StatoPagamento, null>, string> = { pagata: "Pagata", da_pagare: "Da pagare", scaduta: "Scaduta" };

const MESI_VISIBILI = 24;

// Utilità -----------------------------------------------------------------------------------------------

type Errore = { code?: string; message: string } | null;

/** Tabella o colonna della migrazione 0009 non ancora presente nel database. */
function mancaMigrazione(e: Errore): boolean {
  return !!e && ["PGRST205", "PGRST204", "42P01", "42703"].includes(e.code ?? "");
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v));
const testo = (v: unknown): string | null => (v === null || v === undefined || String(v).trim() === "" ? null : String(v));
const uno = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/** Data di oggi (Europa/Roma) in formato YYYY-MM-DD, per confrontarla con le date delle scadenze. */
export function oggiIso(d = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(d);
}

/** Primo giorno del periodo visibile al cliente (24 mesi, punto aperto 2 del brief). */
function inizioPeriodo(d = new Date()): string {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth() - MESI_VISIBILI + 1, 1)).toISOString().slice(0, 10);
}

function normalizzaDocumento(r: Record<string, unknown>): Documento {
  return {
    id: Number(r.id),
    chiave_nts: String(r.chiave_nts),
    cliente_id: Number(r.cliente_id),
    tipo: r.tipo as TipoDocumento,
    sottotipo: testo(r.sottotipo),
    anno: Number(r.anno),
    serie: String(r.serie ?? ""),
    numero: Number(r.numero),
    data_doc: String(r.data_doc),
    destinazione: testo(r.destinazione),
    agente_desc: testo(r.agente_desc),
    pagamento_codice: testo(r.pagamento_codice),
    pagamento_desc: testo(r.pagamento_desc),
    imponibile: Number(r.imponibile ?? 0),
    iva: Number(r.iva ?? 0),
    totale: Number(r.totale ?? 0),
    trasporto_a_cura: testo(r.trasporto_a_cura),
    causale_trasporto: testo(r.causale_trasporto),
    aspetto_esteriore: testo(r.aspetto_esteriore),
    vettore: testo(r.vettore),
    totale_colli: num(r.totale_colli),
    peso: num(r.peso),
    note: testo(r.note),
    presente_in_nts: r.presente_in_nts !== false,
    aggiornato_il: String(r.aggiornato_il),
  };
}

const breve = (r: Record<string, unknown>): DocumentoBreve => ({
  id: Number(r.id),
  tipo: r.tipo as TipoDocumento,
  numero: Number(r.numero),
  data_doc: String(r.data_doc),
  totale: Number(r.totale ?? 0),
});

function normalizzaScadenza(r: Record<string, unknown>, oggi: string): Scadenza {
  const stato = r.stato as StatoScadenza;
  const data = String(r.data_scadenza);
  const doc = uno(r.documento as Record<string, unknown> | Record<string, unknown>[] | null);
  return {
    id: Number(r.id),
    data_scadenza: data,
    importo: Number(r.importo ?? 0),
    residuo: Number(r.residuo ?? 0),
    stato,
    tipo_pagamento: testo(r.tipo_pagamento),
    scaduta: stato !== "pagata" && data < oggi,
    documento: doc && doc.id !== null && doc.presente_in_nts !== false ? breve(doc) : null,
  };
}

/** Stato di pagamento di un documento dalle sue scadenze: scaduta > da pagare > pagata. */
export function statoPagamento(scadenze: Pick<Scadenza, "stato" | "scaduta">[]): StatoPagamento {
  if (scadenze.length === 0) return null;
  if (scadenze.some((s) => s.stato !== "pagata" && s.scaduta)) return "scaduta";
  if (scadenze.some((s) => s.stato !== "pagata")) return "da_pagare";
  return "pagata";
}

/** Lotto da mostrare: i lotti fittizi "01 31/12/2099" (articoli senza lotto vero) non si mostrano. */
export function lottoVero(r: Pick<RigaDocumento, "lotto" | "scadenza_lotto">): boolean {
  if (!r.lotto) return false;
  return !(r.scadenza_lotto && r.scadenza_lotto >= "2099-01-01");
}

/** Titolo del documento: "DDT n. 18.931", "Fattura differita n. 5113", "Nota di credito n. 12". */
export function titoloDocumento(d: Pick<Documento, "tipo" | "sottotipo" | "numero" | "serie">): string {
  const nome = d.tipo === "fattura" && d.sottotipo ? `Fattura ${d.sottotipo}` : ETICHETTA_TIPO[d.tipo];
  const numero = new Intl.NumberFormat("it-IT", { useGrouping: "always" }).format(d.numero);
  return `${nome} n. ${d.serie.trim() ? `${d.serie.trim()}/` : ""}${numero}`;
}

// Elenchi ------------------------------------------------------------------------------------------------

export type FiltroDocumenti = { tipi: TipoDocumento[]; mese?: string | null; pagina?: number; perPagina?: number };

export type ElencoDocumenti = { disponibile: boolean; documenti: DocumentoElenco[]; totale: number; pagina: number; pagine: number };

/** Documenti di un cliente per data (i più recenti per primi), con filtro per mese "YYYY-MM". */
export async function elencoDocumenti(clienteId: number, f: FiltroDocumenti, admin = false): Promise<ElencoDocumenti> {
  const perPagina = f.perPagina ?? 25;
  const pagina = Math.max(1, f.pagina ?? 1);
  const db = supabaseAdmin();
  let q = db.from("documenti").select("*", { count: "exact" }).eq("cliente_id", clienteId).in("tipo", f.tipi);
  if (!admin) q = q.eq("presente_in_nts", true).gte("data_doc", inizioPeriodo());
  if (f.mese && /^\d{4}-(0[1-9]|1[0-2])$/.test(f.mese)) {
    const [a, m] = f.mese.split("-").map(Number);
    q = q.gte("data_doc", `${f.mese}-01`).lt("data_doc", new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 10));
  }
  const da = (pagina - 1) * perPagina;
  const { data, count, error } = await q.order("data_doc", { ascending: false }).order("numero", { ascending: false }).range(da, da + perPagina - 1);
  if (mancaMigrazione(error)) return { disponibile: false, documenti: [], totale: 0, pagina: 1, pagine: 1 };
  if (error) throw new Error(`elencoDocumenti: ${error.message}`);
  const documenti = (data ?? []).map(normalizzaDocumento);

  // Stato di pagamento delle fatture della pagina, dalle loro scadenze
  const fatture = documenti.filter((d) => d.tipo !== "ddt").map((d) => d.id);
  const perDoc = new Map<number, Scadenza[]>();
  if (fatture.length) {
    const oggi = oggiIso();
    const { data: sc, error: es } = await db.from("scadenze").select("id, documento_id, data_scadenza, importo, residuo, stato, tipo_pagamento").in("documento_id", fatture).eq("presente_in_nts", true);
    if (es && !mancaMigrazione(es)) throw new Error(`elencoDocumenti (scadenze): ${es.message}`);
    for (const r of sc ?? []) {
      const s = normalizzaScadenza(r, oggi);
      const k = Number(r.documento_id);
      perDoc.set(k, [...(perDoc.get(k) ?? []), s]);
    }
  }
  const totale = count ?? 0;
  return {
    disponibile: true,
    documenti: documenti.map((d) => ({ ...d, pagamento: d.tipo === "ddt" ? null : statoPagamento(perDoc.get(d.id) ?? []) })),
    totale,
    pagina,
    pagine: Math.max(1, Math.ceil(totale / perPagina)),
  };
}

/** Mesi con almeno un documento dei tipi dati (i più recenti per primi), per il filtro. */
export async function mesiDocumenti(clienteId: number, tipi: TipoDocumento[]): Promise<{ mese: string; n: number }[]> {
  const { data, error } = await supabaseAdmin()
    .from("documenti")
    .select("data_doc")
    .eq("cliente_id", clienteId)
    .in("tipo", tipi)
    .eq("presente_in_nts", true)
    .gte("data_doc", inizioPeriodo())
    .order("data_doc", { ascending: false })
    .limit(5000);
  if (mancaMigrazione(error)) return [];
  if (error) throw new Error(`mesiDocumenti: ${error.message}`);
  const conta = new Map<string, number>();
  for (const r of data ?? []) {
    const m = String(r.data_doc).slice(0, 7);
    conta.set(m, (conta.get(m) ?? 0) + 1);
  }
  return [...conta.entries()].map(([mese, n]) => ({ mese, n }));
}

/** Ultimi documenti di tutti i tipi (scheda cliente dell'ufficio). */
export async function ultimiDocumenti(clienteId: number, limite = 15): Promise<{ disponibile: boolean; documenti: Documento[] }> {
  const { data, error } = await supabaseAdmin()
    .from("documenti")
    .select("*")
    .eq("cliente_id", clienteId)
    .order("data_doc", { ascending: false })
    .order("numero", { ascending: false })
    .limit(limite);
  if (mancaMigrazione(error)) return { disponibile: false, documenti: [] };
  if (error) throw new Error(`ultimiDocumenti: ${error.message}`);
  return { disponibile: true, documenti: (data ?? []).map(normalizzaDocumento) };
}

// Dettaglio ----------------------------------------------------------------------------------------------

/**
 * Documento completo. Con `clienteId` restituisce null se il documento non è di quel cliente
 * o non è più in NTS (stessa risposta di un id inesistente: niente indizi sull'esistenza).
 */
export async function dettaglioDocumento(id: number, clienteId: number | null): Promise<DettaglioDocumento | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const db = supabaseAdmin();
  let q = db.from("documenti").select("*").eq("id", id);
  if (clienteId !== null) q = q.eq("cliente_id", clienteId).eq("presente_in_nts", true);
  const { data, error } = await q.maybeSingle();
  if (mancaMigrazione(error)) return null;
  if (error) throw new Error(`dettaglioDocumento: ${error.message}`);
  if (!data) return null;
  const documento = normalizzaDocumento(data);
  const oggi = oggiIso();

  const [righeR, ivaR, scadR] = await Promise.all([
    db.from("righe_documento").select("*").eq("documento_id", id).order("riga"),
    db.from("riepilogo_iva").select("codice_iva, descrizione, aliquota, imponibile, imposta").eq("documento_id", id).order("aliquota", { ascending: false }),
    db.from("scadenze").select("id, data_scadenza, importo, residuo, stato, tipo_pagamento").eq("documento_id", id).eq("presente_in_nts", true).order("data_scadenza"),
  ]);
  for (const r of [righeR, ivaR, scadR]) if (r.error) throw new Error(`dettaglioDocumento: ${r.error.message}`);

  // Descrizione pulita e disponibilità nel catalogo degli articoli delle righe
  const codici = [...new Set((righeR.data ?? []).map((r) => testo(r.cod_dav)).filter((c): c is string => !!c))];
  const catalogo = new Map<string, { descrizione: string; attivo: boolean }>();
  if (codici.length) {
    const { data: art, error: ea } = await db.from("articoli").select("cod_dav, descrizione_nts, descrizione_pulita, attivo").in("cod_dav", codici);
    if (ea) throw new Error(`dettaglioDocumento (articoli): ${ea.message}`);
    for (const a of art ?? []) catalogo.set(a.cod_dav, { descrizione: a.descrizione_pulita ?? a.descrizione_nts, attivo: a.attivo });
  }
  const righe: RigaDocumento[] = (righeR.data ?? []).map((r) => {
    const cod = testo(r.cod_dav);
    const a = cod ? catalogo.get(cod) : undefined;
    return {
      id: Number(r.id),
      riga: Number(r.riga),
      tipo_riga: r.tipo_riga,
      cod_dav: cod,
      descrizione: testo(r.descrizione),
      descrizione_shop: a?.descrizione ?? null,
      in_catalogo: !!a?.attivo,
      cod_fornitore: testo(r.cod_fornitore),
      um: testo(r.um),
      quantita: num(r.quantita),
      prezzo: num(r.prezzo),
      sconti_testo: testo(r.sconti_testo),
      importo: num(r.importo),
      codice_iva: testo(r.codice_iva),
      aliquota_iva: num(r.aliquota_iva),
      lotto: testo(r.lotto),
      scadenza_lotto: testo(r.scadenza_lotto),
      rif_ddt_numero: num(r.rif_ddt_numero),
      rif_ddt_data: testo(r.rif_ddt_data),
      rif_ordine_numero: num(r.rif_ordine_numero),
      rif_ordine_data: testo(r.rif_ordine_data),
      rif_ordine_shop: testo(r.rif_ordine_shop),
    };
  });

  // Fattura → DDT di provenienza (stesso cliente, stesso numero e data)
  const ddt: DocumentoBreve[] = [];
  if (documento.tipo !== "ddt") {
    const rif = new Map<string, { numero: number; data: string }>();
    for (const r of righe) if (r.rif_ddt_numero !== null && r.rif_ddt_data) rif.set(`${r.rif_ddt_numero}|${r.rif_ddt_data}`, { numero: r.rif_ddt_numero, data: r.rif_ddt_data });
    if (rif.size) {
      const { data: dd, error: ed } = await db
        .from("documenti")
        .select("id, tipo, numero, data_doc, totale, presente_in_nts")
        .eq("cliente_id", documento.cliente_id)
        .eq("tipo", "ddt")
        .in("numero", [...new Set([...rif.values()].map((x) => x.numero))]);
      if (ed) throw new Error(`dettaglioDocumento (DDT): ${ed.message}`);
      const trovati = new Map((dd ?? []).filter((x) => clienteId === null || x.presente_in_nts).map((x) => [`${x.numero}|${x.data_doc}`, breve(x)]));
      for (const k of rif.keys()) {
        const t = trovati.get(k);
        if (t) ddt.push(t);
      }
    }
  }

  // DDT → fattura che lo comprende
  let fattura: DocumentoBreve | null = null;
  if (documento.tipo === "ddt") {
    const { data: ff, error: ef } = await db
      .from("righe_documento")
      .select("documento:documenti!inner(id, tipo, numero, data_doc, totale, cliente_id, presente_in_nts)")
      .eq("rif_ddt_numero", documento.numero)
      .eq("rif_ddt_data", documento.data_doc)
      .eq("documento.cliente_id", documento.cliente_id)
      .eq("documento.tipo", "fattura")
      .limit(1);
    if (ef) throw new Error(`dettaglioDocumento (fattura): ${ef.message}`);
    const f = uno((ff?.[0] as { documento?: Record<string, unknown> | Record<string, unknown>[] } | undefined)?.documento);
    if (f && (clienteId === null || f.presente_in_nts !== false)) fattura = breve(f);
  }

  // Ordini dello shop citati nelle righe (riferimento SHOP-…)
  const riferimenti = [...new Set(righe.map((r) => r.rif_ordine_shop).filter((x): x is string => !!x))];
  let ordiniShop: DettaglioDocumento["ordiniShop"] = [];
  if (riferimenti.length) {
    const { data: oo, error: eo } = await db.from("ordini").select("id, numero, riferimento_nts").eq("cliente_id", documento.cliente_id).in("riferimento_nts", riferimenti);
    if (eo) throw new Error(`dettaglioDocumento (ordini shop): ${eo.message}`);
    ordiniShop = (oo ?? []).map((o) => ({ riferimento: String(o.riferimento_nts), id: Number(o.id), numero: Number(o.numero) }));
  }

  return {
    documento,
    righe,
    iva: (ivaR.data ?? []).map((v) => ({ codice_iva: String(v.codice_iva), descrizione: testo(v.descrizione), aliquota: num(v.aliquota), imponibile: Number(v.imponibile), imposta: Number(v.imposta) })),
    scadenze: (scadR.data ?? []).map((s) => normalizzaScadenza(s, oggi)),
    ddt,
    fattura,
    ordiniShop,
  };
}

/** DDT dello shop collegati a un ordine (per la pagina dell'ordine: "consegnato con DDT n. …"). */
export async function ddtDellOrdine(clienteId: number, riferimento: string | null): Promise<DocumentoBreve[]> {
  if (!riferimento) return [];
  const { data, error } = await supabaseAdmin()
    .from("righe_documento")
    .select("documento:documenti!inner(id, tipo, numero, data_doc, totale, cliente_id, presente_in_nts)")
    .eq("rif_ordine_shop", riferimento)
    .eq("documento.cliente_id", clienteId)
    .eq("documento.presente_in_nts", true)
    .limit(50);
  if (mancaMigrazione(error)) return [];
  if (error) throw new Error(`ddtDellOrdine: ${error.message}`);
  const visti = new Map<number, DocumentoBreve>();
  for (const r of (data ?? []) as { documento: Record<string, unknown> | Record<string, unknown>[] }[]) {
    const d = uno(r.documento);
    if (d) visti.set(Number(d.id), breve(d));
  }
  return [...visti.values()].sort((a, b) => a.data_doc.localeCompare(b.data_doc));
}

// Pagamenti ----------------------------------------------------------------------------------------------

export type SituazionePagamenti = {
  disponibile: boolean;
  pagamento: { codice: string | null; descrizione: string | null };
  /** Aperte e insolute con residuo, per data di scadenza. */
  aperte: Scadenza[];
  /** Ultime pagate (al massimo 10). */
  pagate: Scadenza[];
  totaleDaPagare: number;
  totaleScaduto: number;
  aggiornatoIl: string | null;
};

const CAMPI_SCADENZA = "id, data_scadenza, importo, residuo, stato, tipo_pagamento, documento:documenti(id, tipo, numero, data_doc, totale, presente_in_nts)";

export async function situazionePagamenti(clienteId: number): Promise<SituazionePagamenti> {
  const db = supabaseAdmin();
  const oggi = oggiIso();
  const [cli, aperteR, pagateR, syncR] = await Promise.all([
    db.from("clienti").select("pagamento_codice, pagamento_desc, metodo_pagamento").eq("id", clienteId).maybeSingle(),
    db.from("scadenze").select(CAMPI_SCADENZA).eq("cliente_id", clienteId).eq("presente_in_nts", true).neq("stato", "pagata").gt("residuo", 0).order("data_scadenza"),
    db.from("scadenze").select(CAMPI_SCADENZA).eq("cliente_id", clienteId).eq("presente_in_nts", true).eq("stato", "pagata").order("data_scadenza", { ascending: false }).limit(10),
    db.from("sync_stato").select("ultimo_ok").eq("lavoro", "scadenze").maybeSingle(),
  ]);
  const vuota: SituazionePagamenti = { disponibile: false, pagamento: { codice: null, descrizione: null }, aperte: [], pagate: [], totaleDaPagare: 0, totaleScaduto: 0, aggiornatoIl: null };
  if ([cli.error, aperteR.error, pagateR.error].some(mancaMigrazione)) return vuota;
  for (const e of [cli.error, aperteR.error, pagateR.error]) if (e) throw new Error(`situazionePagamenti: ${e.message}`);
  const aperte = (aperteR.data ?? []).map((s) => normalizzaScadenza(s, oggi));
  const centesimi = (v: number) => Math.round(v * 100) / 100;
  return {
    disponibile: true,
    pagamento: { codice: testo(cli.data?.pagamento_codice), descrizione: testo(cli.data?.pagamento_desc) ?? testo(cli.data?.metodo_pagamento) },
    aperte,
    pagate: (pagateR.data ?? []).map((s) => normalizzaScadenza(s, oggi)),
    totaleDaPagare: centesimi(aperte.reduce((t, s) => t + s.residuo, 0)),
    totaleScaduto: centesimi(aperte.filter((s) => s.scaduta).reduce((t, s) => t + s.residuo, 0)),
    aggiornatoIl: syncR.error ? null : testo(syncR.data?.ultimo_ok),
  };
}

// Sincronizzazione (cruscotto ufficio) --------------------------------------------------------------------

export const MINUTI_SYNC_FERMA = 60;

export type LavoroSync = { lavoro: string; ultimo_ok: string | null; ultimo_errore: string | null; errore_il: string | null; righe: number | null; ferma: boolean; minuti: number | null };

export async function statoSync(): Promise<{ disponibile: boolean; lavori: LavoroSync[]; documenti: number; scadenzeAperte: number }> {
  const db = supabaseAdmin();
  const [s, d, a] = await Promise.all([
    db.from("sync_stato").select("lavoro, ultimo_ok, ultimo_errore, errore_il, righe").order("lavoro"),
    db.from("documenti").select("id", { count: "exact", head: true }).eq("presente_in_nts", true),
    db.from("scadenze").select("id", { count: "exact", head: true }).eq("presente_in_nts", true).neq("stato", "pagata"),
  ]);
  if ([s.error, d.error, a.error].some(mancaMigrazione)) return { disponibile: false, lavori: [], documenti: 0, scadenzeAperte: 0 };
  for (const e of [s.error, d.error, a.error]) if (e) throw new Error(`statoSync: ${e.message}`);
  const adesso = Date.now();
  const lavori = (s.data ?? []).map((r) => {
    const ultimo = testo(r.ultimo_ok);
    const minuti = ultimo ? Math.floor((adesso - new Date(ultimo).getTime()) / 60000) : null;
    // Il ripasso notturno gira una volta al giorno: per lui la soglia è 26 ore, per gli altri un'ora.
    const soglia = /notte/i.test(String(r.lavoro)) ? 26 * 60 : MINUTI_SYNC_FERMA;
    return { lavoro: String(r.lavoro), ultimo_ok: ultimo, ultimo_errore: testo(r.ultimo_errore), errore_il: testo(r.errore_il), righe: num(r.righe), minuti, ferma: minuti === null || minuti > soglia };
  });
  return { disponibile: true, lavori, documenti: d.count ?? 0, scadenzeAperte: a.count ?? 0 };
}
