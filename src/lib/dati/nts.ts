/**
 * Ordini verso NTS, lato shop (BRIEF_INTEGRAZIONE_NTS, sezione 6).
 * Il lavoro vero lo fa il connettore in LAN (cartella `connettore-nts/`); qui ci sono
 * le letture per l'ufficio, le due azioni manuali e l'allarme se il connettore tace.
 * Service role, solo lato server e solo dopo il controllo di sessione admin
 * (tranne `controllaConnettore`, che legge e scrive soltanto le impostazioni).
 */
import { supabaseAdmin } from "@/lib/supabase/admin";
import { escapeHtml, inviaEmail } from "@/lib/email/invio";
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
};

export type Connettore = { stato: StatoConnettore | null; fermo: boolean; minuti: number | null };

export async function leggiConnettore(): Promise<Connettore> {
  const { data, error } = await supabaseAdmin().from("impostazioni").select("valore").eq("chiave", "connettore_nts").maybeSingle();
  if (error || !data) return { stato: null, fermo: false, minuti: null };
  const v = data.valore as Partial<StatoConnettore>;
  if (!v?.ultimo_giro) return { stato: null, fermo: false, minuti: null };
  const minuti = Math.floor((Date.now() - new Date(v.ultimo_giro).getTime()) / 60000);
  return {
    stato: {
      ultimo_giro: v.ultimo_giro,
      modalita: String(v.modalita ?? "?"),
      sql_ok: v.sql_ok !== false,
      ultimo_errore: v.ultimo_errore ?? null,
      versione: v.versione ?? null,
      clienti_abilitati: v.clienti_abilitati ?? null,
    },
    fermo: minuti >= MINUTI_SILENZIO,
    minuti,
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

/**
 * Se il connettore non si fa sentire da più di MINUTI_SILENZIO minuti, manda un'email
 * all'ufficio (al massimo una all'ora). Non fa nulla se il connettore non è mai partito.
 * Lo shop non ha processi in background: si chiama alla conferma di un ordine e
 * all'apertura del cruscotto.
 */
export async function controllaConnettore(): Promise<Connettore> {
  const c = await leggiConnettore();
  if (!c.stato || !c.fermo) return c;
  try {
    const db = supabaseAdmin();
    const { data } = await db.from("impostazioni").select("valore").eq("chiave", "connettore_nts_allarme").maybeSingle();
    const ultimo = typeof data?.valore === "string" ? new Date(data.valore).getTime() : 0;
    if (Date.now() - ultimo < 60 * 60 * 1000) return c;
    await db.from("impostazioni").upsert({ chiave: "connettore_nts_allarme", valore: new Date().toISOString() });
    const { data: em } = await db.from("impostazioni").select("valore").eq("chiave", "email_ordini").maybeSingle();
    const a = typeof em?.valore === "string" ? em.valore : process.env.EMAIL_ORDINI || "info@davsnc.it";
    const quando = new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Rome" }).format(new Date(c.stato.ultimo_giro));
    const testo =
      `Il connettore NTS non si fa sentire da ${c.minuti} minuti (ultimo giro: ${quando}).\n` +
      "Gli ordini dello shop non stanno entrando in NTS in automatico.\n\n" +
      "Controllare che la macchina del connettore sia accesa e in rete e che il servizio ShopDavConnettoreNts sia avviato.\n" +
      "Nel frattempo gli ordini restano in coda e partono appena il connettore riparte; l'email di ogni ordine arriva comunque.";
    await inviaEmail({
      a: [a],
      oggetto: "[Shop DAV] Connettore NTS fermo",
      html: `<pre style="font-family:Arial,sans-serif;font-size:14px;white-space:pre-wrap">${escapeHtml(testo)}</pre>`,
      testo,
    });
  } catch (e) {
    console.error("controllaConnettore:", e);
  }
  return c;
}
