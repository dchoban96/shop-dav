/**
 * Livello dati dell'area admin (ufficio DAV). Service role, solo lato server e solo
 * dopo `leggiSessioneAdmin()`: il controllo di ruolo sta nel layout, nelle azioni e
 * nella route di esportazione.
 */
import { supabaseAdmin } from "@/lib/supabase/admin";
import { righeOrdine, type Ordine, type RigaOrdine, type StatoOrdine } from "@/lib/dati/ordini";

export const STATI_ADMIN: StatoOrdine[] = ["inviato", "confermato", "inserito_nts", "consegnato", "annullato"];

export type ClienteBreve = { id: number; codice_nts: string; ragione_sociale: string; demo: boolean };
export type OrdineAdmin = Ordine & { cliente: ClienteBreve | null; n_righe: number };

const uno = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

type OrdineDb = Record<string, unknown> & {
  cliente: ClienteBreve | ClienteBreve[] | null;
  righe_ordine?: { count: number }[];
};

function normalizza(o: OrdineDb): OrdineAdmin {
  return {
    id: Number(o.id),
    numero: Number(o.numero),
    stato: o.stato as StatoOrdine,
    data_consegna_richiesta: (o.data_consegna_richiesta as string | null) ?? null,
    note: (o.note as string | null) ?? null,
    totale_netto: Number(o.totale_netto ?? 0),
    creato_il: String(o.creato_il),
    email_inviata_il: (o.email_inviata_il as string | null) ?? null,
    cliente: uno(o.cliente),
    n_righe: o.righe_ordine?.[0]?.count ?? 0,
  };
}

const CAMPI_ORDINE = "*, cliente:clienti!inner(id, codice_nts, ragione_sociale, demo), righe_ordine(count)";

// Cruscotto ---------------------------------------------------------------------

export type Cruscotto = {
  oggi: number;
  daGestire: number;
  clienti: number;
  clientiDemo: number;
  ultimiImport: { tipo: string; nome_file: string; eseguito_il: string; righe_lette: number; errori: number }[];
};

function inizioOggiIso(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
}

export async function leggiCruscotto(): Promise<Cruscotto> {
  const db = supabaseAdmin();
  const conta = async (q: PromiseLike<{ count: number | null; error: { message: string } | null }>) => {
    const { count, error } = await q;
    if (error) throw new Error(error.message);
    return count ?? 0;
  };
  const [oggi, daGestire, clienti, clientiDemo, log] = await Promise.all([
    conta(db.from("ordini").select("id", { count: "exact", head: true }).neq("stato", "bozza").gte("creato_il", inizioOggiIso())),
    conta(db.from("ordini").select("id", { count: "exact", head: true }).eq("stato", "inviato")),
    conta(db.from("clienti").select("id", { count: "exact", head: true }).eq("demo", false)),
    conta(db.from("clienti").select("id", { count: "exact", head: true }).eq("demo", true)),
    db.from("import_log").select("tipo, nome_file, eseguito_il, righe_lette, errori").order("eseguito_il", { ascending: false }).limit(50),
  ]);
  if (log.error) throw new Error(log.error.message);
  const visti = new Set<string>();
  const ultimiImport = (log.data ?? []).filter((r) => (visti.has(r.tipo) ? false : (visti.add(r.tipo), true)));
  return { oggi, daGestire, clienti, clientiDemo, ultimiImport };
}

// Ordini ------------------------------------------------------------------------

export type FiltroOrdini = { stato?: string; q?: string; dal?: string; al?: string; pagina?: number };

export async function elencoOrdini(f: FiltroOrdini): Promise<{ ordini: OrdineAdmin[]; totale: number; pagina: number; pagine: number }> {
  const perPagina = 30;
  const pagina = Math.max(1, f.pagina ?? 1);
  let q = supabaseAdmin().from("ordini").select(CAMPI_ORDINE, { count: "exact" }).neq("stato", "bozza");
  if (f.stato && (STATI_ADMIN as string[]).includes(f.stato)) q = q.eq("stato", f.stato);
  if (f.dal && /^\d{4}-\d{2}-\d{2}$/.test(f.dal)) q = q.gte("creato_il", `${f.dal}T00:00:00`);
  if (f.al && /^\d{4}-\d{2}-\d{2}$/.test(f.al)) q = q.lte("creato_il", `${f.al}T23:59:59`);
  const testo = (f.q ?? "").trim().replace(/[,().%\\]/g, " ").trim();
  if (testo) {
    // Numeri fino a 6 cifre: numero d'ordine. Altrimenti codice o ragione sociale del cliente.
    if (/^\d{1,6}$/.test(testo)) q = q.eq("numero", Number(testo));
    else q = q.or(`codice_nts.ilike.%${testo}%,ragione_sociale.ilike.%${testo}%`, { referencedTable: "clienti" });
  }
  const da = (pagina - 1) * perPagina;
  const { data, count, error } = await q.order("creato_il", { ascending: false }).range(da, da + perPagina - 1);
  if (error) throw new Error(`elencoOrdini: ${error.message}`);
  const totale = count ?? 0;
  return { ordini: ((data ?? []) as OrdineDb[]).map(normalizza), totale, pagina, pagine: Math.max(1, Math.ceil(totale / perPagina)) };
}

export async function ordineAdmin(id: number): Promise<{ ordine: OrdineAdmin; righe: RigaOrdine[] } | null> {
  const { data, error } = await supabaseAdmin().from("ordini").select(CAMPI_ORDINE).eq("id", id).neq("stato", "bozza").maybeSingle();
  if (error) throw new Error(`ordineAdmin: ${error.message}`);
  if (!data) return null;
  return { ordine: normalizza(data as OrdineDb), righe: await righeOrdine(id) };
}

export async function cambiaStatoOrdine(id: number, stato: StatoOrdine): Promise<void> {
  if (!STATI_ADMIN.includes(stato)) throw new Error("Stato non valido");
  const { error } = await supabaseAdmin().from("ordini").update({ stato }).eq("id", id).neq("stato", "bozza");
  if (error) throw new Error(`cambiaStatoOrdine: ${error.message}`);
}

/** Righe degli ordini filtrati, per l'esportazione CSV (massimo 5.000 righe). */
export async function righePerEsportazione(f: FiltroOrdini): Promise<{ ordine: OrdineAdmin; righe: RigaOrdine[] }[]> {
  const out: { ordine: OrdineAdmin; righe: RigaOrdine[] }[] = [];
  let righeTot = 0;
  for (let pagina = 1; righeTot < 5000; pagina++) {
    const { ordini, pagine } = await elencoOrdini({ ...f, pagina });
    for (const o of ordini) {
      const righe = await righeOrdine(o.id);
      out.push({ ordine: o, righe });
      righeTot += righe.length;
    }
    if (pagina >= pagine) break;
  }
  return out;
}

// Clienti -----------------------------------------------------------------------

export type ClienteElenco = ClienteBreve & { comune: string | null; email: string | null; n_ordini: number; priorita_onboarding: boolean };

export async function elencoClienti(f: { q?: string; demo?: boolean; pagina?: number }): Promise<{ clienti: ClienteElenco[]; totale: number; pagina: number; pagine: number }> {
  const perPagina = 40;
  const pagina = Math.max(1, f.pagina ?? 1);
  let q = supabaseAdmin()
    .from("clienti")
    .select("id, codice_nts, ragione_sociale, comune, email, demo, priorita_onboarding, ordini(count)", { count: "exact" })
    .neq("ordini.stato", "bozza");
  if (f.demo !== undefined) q = q.eq("demo", f.demo);
  const testo = (f.q ?? "").trim().replace(/[,().%\\]/g, " ").trim();
  if (testo) q = q.or(`codice_nts.ilike.%${testo}%,ragione_sociale.ilike.%${testo}%,comune.ilike.%${testo}%`);
  const da = (pagina - 1) * perPagina;
  const { data, count, error } = await q.order("priorita_onboarding", { ascending: false }).order("ragione_sociale").range(da, da + perPagina - 1);
  if (error) throw new Error(`elencoClienti: ${error.message}`);
  type R = Omit<ClienteElenco, "n_ordini"> & { ordini: { count: number }[] };
  const clienti = ((data ?? []) as R[]).map(({ ordini, ...c }) => ({ ...c, n_ordini: ordini?.[0]?.count ?? 0 }));
  const totale = count ?? 0;
  return { clienti, totale, pagina, pagine: Math.max(1, Math.ceil(totale / perPagina)) };
}

export type SchedaCliente = {
  cliente: Record<string, unknown> & ClienteBreve;
  telefoni: { numero_e164: string; nome_contatto: string | null; usa_whatsapp: boolean }[];
  condizioni: { tipo: string; riferimento: string; sconto1: number; sconto2: number; prezzo_accordato: number | null; valido_al: string | null }[];
  ordini: OrdineAdmin[];
};

export async function schedaCliente(id: number): Promise<SchedaCliente | null> {
  const db = supabaseAdmin();
  const { data: cliente, error } = await db.from("clienti").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`schedaCliente: ${error.message}`);
  if (!cliente) return null;
  const [tel, cond, ord] = await Promise.all([
    db.from("clienti_telefoni").select("numero_e164, nome_contatto, usa_whatsapp").eq("cliente_id", id),
    db.from("condizioni_cliente").select("tipo, cod_dav, sconto1, sconto2, prezzo_accordato, valido_al, famiglia:famiglie(nome), articolo:articoli(descrizione_pulita)").eq("cliente_id", id).order("tipo"),
    db.from("ordini").select(CAMPI_ORDINE).eq("cliente_id", id).neq("stato", "bozza").order("creato_il", { ascending: false }).limit(50),
  ]);
  for (const r of [tel, cond, ord]) if (r.error) throw new Error(`schedaCliente: ${r.error.message}`);
  type C = { tipo: string; cod_dav: string | null; sconto1: string; sconto2: string; prezzo_accordato: string | null; valido_al: string | null; famiglia: { nome: string } | { nome: string }[] | null; articolo: { descrizione_pulita: string | null } | { descrizione_pulita: string | null }[] | null };
  return {
    cliente: cliente as SchedaCliente["cliente"],
    telefoni: (tel.data ?? []) as SchedaCliente["telefoni"],
    condizioni: ((cond.data ?? []) as unknown as C[]).map((c) => ({
      tipo: c.tipo,
      riferimento: c.tipo === "articolo" ? `${c.cod_dav} ${uno(c.articolo)?.descrizione_pulita ?? ""}`.trim() : c.tipo === "famiglia" ? (uno(c.famiglia)?.nome ?? "") : "Tutti gli articoli",
      sconto1: Number(c.sconto1),
      sconto2: Number(c.sconto2),
      prezzo_accordato: c.prezzo_accordato === null ? null : Number(c.prezzo_accordato),
      valido_al: c.valido_al,
    })),
    ordini: ((ord.data ?? []) as OrdineDb[]).map(normalizza),
  };
}

// Impostazioni ------------------------------------------------------------------

export type Impostazioni = { soglia_esaurimento: number; email_ordini: string };

export async function leggiImpostazioni(): Promise<Impostazioni> {
  const { data, error } = await supabaseAdmin().from("impostazioni").select("chiave, valore").in("chiave", ["soglia_esaurimento", "email_ordini"]);
  if (error) throw new Error(`leggiImpostazioni: ${error.message}`);
  const m = new Map((data ?? []).map((r) => [r.chiave as string, r.valore as unknown]));
  const soglia = Number(m.get("soglia_esaurimento"));
  return {
    soglia_esaurimento: Number.isFinite(soglia) ? soglia : 2,
    email_ordini: typeof m.get("email_ordini") === "string" ? (m.get("email_ordini") as string) : "info@davsnc.it",
  };
}

export async function salvaImpostazioni(v: Impostazioni): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("impostazioni")
    .upsert([
      { chiave: "soglia_esaurimento", valore: v.soglia_esaurimento },
      { chiave: "email_ordini", valore: v.email_ordini },
    ]);
  if (error) throw new Error(`salvaImpostazioni: ${error.message}`);
}
