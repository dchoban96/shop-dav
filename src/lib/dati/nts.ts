/**
 * Ordini verso NTS, lato shop (BRIEF_INTEGRAZIONE_NTS, sezione 6).
 * Il lavoro vero lo fa il connettore in LAN (cartella `connettore-nts/`); qui ci sono
 * le letture per l'ufficio e le due azioni manuali. L'email "connettore fermo" la manda
 * un job pg_cron in Supabase (migrazione 0008), non lo shop.
 * Service role, solo lato server e solo dopo il controllo di sessione admin.
 */
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { StatoNts } from "@/lib/dati/ordini";

export const ETICHETTA_NTS: Record<StatoNts, string> = {
  da_inviare: "Da inviare",
  in_invio: "In invio",
  in_frontiera: "In frontiera",
  in_nts: "In NTS",
  da_verificare: "Da verificare",
  errore: "Errore",
  manuale: "Inserito a mano",
};

export const STATI_NTS = Object.keys(ETICHETTA_NTS) as StatoNts[];
export const DA_CONTROLLARE: StatoNts[] = ["errore", "da_verificare"];

/** Minuti di silenzio oltre i quali il connettore è considerato fermo. */
export const MINUTI_SILENZIO = 5;

export type StatoConnettore = {
  ultimo_giro: string;
  modalita: string;
  sql_ok: boolean;
  ultimo_errore: string | null;
  versione: string | null;
  clienti_abilitati: string | null;
  /** Da dove li prende il connettore: "shop" (Impostazioni) o ".env". */
  clienti_da: string | null;
};

/** Ultimo avviso "connettore fermo" del job in Supabase (impostazioni.connettore_nts_allarme). */
export type AvvisoConnettore = { inviato_il: string; esito: string };

export type Connettore = { stato: StatoConnettore | null; fermo: boolean; minuti: number | null; avviso: AvvisoConnettore | null };

export async function leggiConnettore(): Promise<Connettore> {
  const { data, error } = await supabaseAdmin().from("impostazioni").select("chiave, valore").in("chiave", ["connettore_nts", "connettore_nts_allarme"]);
  const valori = new Map((error ? [] : (data ?? [])).map((r) => [r.chiave as string, r.valore as Record<string, unknown>]));
  const a = valori.get("connettore_nts_allarme");
  const avviso = a?.inviato_il ? { inviato_il: String(a.inviato_il), esito: String(a.esito ?? "") } : null;
  const v = valori.get("connettore_nts") as (Partial<StatoConnettore> & { ricevuto_il?: string }) | undefined;
  if (!v?.ultimo_giro) return { stato: null, fermo: false, minuti: null, avviso };
  // ricevuto_il lo mette il database (migrazione 0008): non dipende dall'orologio della macchina in LAN.
  const ultimo = v.ricevuto_il ?? v.ultimo_giro;
  const minuti = Math.floor((Date.now() - new Date(ultimo).getTime()) / 60000);
  return {
    stato: {
      ultimo_giro: ultimo,
      modalita: String(v.modalita ?? "?"),
      sql_ok: v.sql_ok !== false,
      ultimo_errore: v.ultimo_errore ?? null,
      versione: v.versione ?? null,
      clienti_abilitati: v.clienti_abilitati ?? null,
      clienti_da: v.clienti_da ?? null,
    },
    fermo: minuti >= MINUTI_SILENZIO,
    minuti,
    avviso,
  };
}

/** Ordini in errore o da verificare. null se le colonne NTS non ci sono ancora (migrazione 0007 non applicata). */
export async function contaDaControllare(): Promise<number | null> {
  const { count, error } = await supabaseAdmin().from("ordini").select("id", { count: "exact", head: true }).in("stato_nts", DA_CONTROLLARE);
  return error ? null : (count ?? 0);
}

export type VoceLog = { id: number; quando: string; evento: string; dettaglio: string | null };

export async function logNts(ordineId: number): Promise<VoceLog[]> {
  const { data, error } = await supabaseAdmin().from("log_nts").select("id, quando, evento, dettaglio").eq("ordine_id", ordineId).order("quando", { ascending: false }).order("id", { ascending: false }).limit(100);
  if (error) return [];
  return (data ?? []) as VoceLog[];
}

async function passaStato(ordineId: number, da: StatoNts[], a: StatoNts, evento: string, dettaglio: string, azzera = false): Promise<boolean> {
  const { data, error } = await supabaseAdmin().rpc("passa_stato_nts", {
    p_ordine_id: ordineId,
    p_da: da,
    p_a: a,
    p_evento: evento,
    p_dettaglio: dettaglio,
    p_azzera_tentativi: azzera,
  });
  if (error) throw new Error(`passa_stato_nts: ${error.message}`);
  return data === true;
}

/**
 * Reinvia: solo per ordini in errore che non sono mai arrivati in frontiera (controlli falliti).
 * Il connettore cerca comunque il riferimento in frontiera prima di scrivere: niente doppioni.
 */
export async function reinviaOrdineNts(ordineId: number): Promise<boolean> {
  return passaStato(ordineId, ["errore"], "da_inviare", "reinvio", "Reinviato dall'ufficio", true);
}

/** L'ufficio l'ha inserito (o controllato) a mano in NTS: il connettore non lo tocca più. */
export async function segnaInseritoAMano(ordineId: number, nota: string): Promise<boolean> {
  return passaStato(ordineId, ["errore", "da_verificare", "da_inviare"], "manuale", "manuale", nota);
}
