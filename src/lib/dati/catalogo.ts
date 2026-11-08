/**
 * Livello dati del catalogo.
 *
 * FASE DEMO: le letture usano il client con service role (bypassa RLS) e vanno
 * chiamate SOLO da Server Component dentro `(cliente)`, dove la sessione è già
 * verificata dal layout. Con Supabase Auth si passerà al client con la sessione
 * utente (`supabaseServer()`) e le policy RLS faranno il resto; le firme restano.
 */
import { supabaseAdmin } from "@/lib/supabase/admin";

export type Famiglia = { id: number; nome: string; n_articoli: number };
export type Marchio = {
  id: number;
  nome_nts: string;
  nome_breve: string | null;
  logo_path: string | null;
  cartella_foto: string | null;
  n_articoli: number;
  fatturato_12m: number;
};

export type Articolo = {
  cod_dav: string;
  descrizione_nts: string;
  descrizione_pulita: string | null;
  um: string | null;
  pezzi_confezione: number | null;
  prezzo_listino: number | null;
  foto_path: string | null;
  scheda_pdf_path: string | null;
  top80: boolean;
  famiglia: { id: number; nome: string } | null;
  fornitore: { id: number; nome_breve: string | null; nome_nts: string; logo_path: string | null } | null;
  giacenza: number | null;
};

export type Disponibilita = "disponibile" | "in_esaurimento" | "su_ordinazione" | "non_nota";

export type Ordinamento = "nome" | "vendite" | "codice";

export type Ricerca = {
  q?: string;
  famiglia?: number;
  marchio?: number;
  ordina?: Ordinamento;
  pagina?: number;
  perPagina?: number;
};

const CAMPI_ARTICOLO =
  "cod_dav, descrizione_nts, descrizione_pulita, um, pezzi_confezione, prezzo_listino, foto_path, scheda_pdf_path, top80, " +
  "famiglia:famiglie(id, nome), fornitore:fornitori(id, nome_breve, nome_nts, logo_path), giacenze(quantita)";

type RigaDb = Omit<Articolo, "giacenza" | "famiglia" | "fornitore"> & {
  famiglia: Articolo["famiglia"] | Articolo["famiglia"][];
  fornitore: Articolo["fornitore"] | Articolo["fornitore"][];
  giacenze: { quantita: number } | { quantita: number }[] | null;
};

function normalizza(r: RigaDb): Articolo {
  const uno = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
  const g = uno(r.giacenze);
  return {
    cod_dav: r.cod_dav,
    descrizione_nts: r.descrizione_nts,
    descrizione_pulita: r.descrizione_pulita,
    um: r.um,
    pezzi_confezione: r.pezzi_confezione === null ? null : Number(r.pezzi_confezione),
    prezzo_listino: r.prezzo_listino === null ? null : Number(r.prezzo_listino),
    foto_path: r.foto_path,
    scheda_pdf_path: r.scheda_pdf_path,
    top80: r.top80,
    famiglia: uno(r.famiglia),
    fornitore: uno(r.fornitore),
    giacenza: g ? Number(g.quantita) : null,
  };
}

export async function cercaArticoli(r: Ricerca): Promise<{ articoli: Articolo[]; totale: number; pagina: number; pagine: number }> {
  const perPagina = r.perPagina ?? 24;
  const pagina = Math.max(1, r.pagina ?? 1);
  const db = supabaseAdmin();
  let q = db.from("articoli").select(CAMPI_ARTICOLO, { count: "exact" }).eq("attivo", true);

  const testo = (r.q ?? "").trim();
  if (testo) {
    const parole = testo.split(/\s+/).filter(Boolean).slice(0, 6);
    if (parole.length === 1) {
      q = q.or(`cod_dav.ilike.%${pulisci(parole[0])}%,descrizione_nts.ilike.%${pulisci(parole[0])}%`);
    } else {
      for (const p of parole) q = q.ilike("descrizione_nts", `%${pulisci(p)}%`);
    }
  }
  if (r.famiglia) q = q.eq("famiglia_id", r.famiglia);
  if (r.marchio) q = q.eq("fornitore_id", r.marchio);

  switch (r.ordina ?? "nome") {
    case "vendite":
      q = q.order("fatturato_12m", { ascending: false, nullsFirst: false }).order("descrizione_pulita");
      break;
    case "codice":
      q = q.order("cod_dav");
      break;
    default:
      q = q.order("descrizione_pulita").order("cod_dav");
  }

  const da = (pagina - 1) * perPagina;
  const { data, count, error } = await q.range(da, da + perPagina - 1);
  if (error) throw new Error(`cercaArticoli: ${error.message}`);
  const totale = count ?? 0;
  return {
    articoli: ((data ?? []) as unknown as RigaDb[]).map(normalizza),
    totale,
    pagina,
    pagine: Math.max(1, Math.ceil(totale / perPagina)),
  };
}

/** Caratteri che PostgREST userebbe come separatori nei filtri `or`. */
function pulisci(s: string): string {
  return s.replace(/[,().%\\]/g, " ").trim();
}

export async function leggiArticolo(codDav: string): Promise<Articolo | null> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("articoli").select(CAMPI_ARTICOLO).eq("cod_dav", codDav).maybeSingle();
  if (error) throw new Error(`leggiArticolo: ${error.message}`);
  return data ? normalizza(data as unknown as RigaDb) : null;
}

export async function leggiFamiglie(): Promise<Famiglia[]> {
  const { data, error } = await supabaseAdmin().from("v_famiglie_catalogo").select("*");
  if (error) throw new Error(`leggiFamiglie: ${error.message}`);
  return (data ?? []) as Famiglia[];
}

export async function leggiMarchi(): Promise<Marchio[]> {
  const { data, error } = await supabaseAdmin().from("v_marchi_catalogo").select("*");
  if (error) throw new Error(`leggiMarchi: ${error.message}`);
  return ((data ?? []) as Marchio[]).map((m) => ({ ...m, fatturato_12m: Number(m.fatturato_12m) }));
}

export type Partner = { id: number; nome_breve: string | null; nome_nts: string; logo_path: string | null; presentazione: string | null };

/** Fornitori da mostrare in pubblico (/partner, landing): solo con autorizzazione scritta, `pubblicato = true`. */
export async function leggiPartner(): Promise<Partner[]> {
  const { data, error } = await supabaseAdmin()
    .from("fornitori")
    .select("id, nome_breve, nome_nts, logo_path, presentazione")
    .eq("attivo", true)
    .eq("pubblicato", true)
    .order("nome_breve");
  if (error) throw new Error(`leggiPartner: ${error.message}`);
  return (data ?? []) as Partner[];
}

export async function sogliaEsaurimento(): Promise<number> {
  const { data } = await supabaseAdmin().from("impostazioni").select("valore").eq("chiave", "soglia_esaurimento").maybeSingle();
  const n = Number(data?.valore);
  return Number.isFinite(n) ? n : 2;
}

/** Stessa regola della funzione SQL public.disponibilita; `non_nota` se manca la giacenza. */
export function disponibilita(giacenza: number | null, soglia: number): Disponibilita {
  if (giacenza === null) return "non_nota";
  if (giacenza <= 0) return "su_ordinazione";
  if (giacenza <= soglia) return "in_esaurimento";
  return "disponibile";
}

export function etichettaDisponibilita(d: Disponibilita): string {
  return {
    disponibile: "Disponibile",
    in_esaurimento: "In esaurimento",
    su_ordinazione: "Su ordinazione",
    non_nota: "Disponibilità in aggiornamento",
  }[d];
}

export function formattaPrezzo(v: number | null): string | null {
  if (v === null) return null;
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(v);
}

export function nomeMarchio(a: Articolo): string {
  return a.fornitore?.nome_breve || a.fornitore?.nome_nts || "";
}
