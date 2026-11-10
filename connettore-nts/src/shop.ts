/**
 * Lato Supabase del connettore (service role). Gli stati cambiano solo con
 * `passa_stato_nts`, che controlla lo stato di partenza e scrive il log nella stessa
 * transazione: connettore e ufficio non si sovrascrivono a vicenda.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Config } from "./config.js";
import { CHIAVE_CLIENTI_NTS, clientiDaImpostazione, type OrdineShop } from "./regole.js";

export type StatoNts = "da_inviare" | "in_invio" | "in_frontiera" | "in_nts" | "da_verificare" | "errore" | "manuale";

export type Passaggio = {
  idFrontiera?: number;
  numeroNts?: number;
  errore?: string;
  evento?: string;
  dettaglio?: string;
  provaOk?: boolean;
};

/** Ordine in attesa di esito o rimasto a metà: i campi che servono al connettore. */
export type OrdineInCorso = {
  id: number;
  numero: number;
  riferimento_nts: string;
  stato_nts: StatoNts;
  id_frontiera: number | null;
  creato_il: string;
  in_invio_il: string | null;
  in_frontiera_il: string | null;
  cliente: { codice_nts: string; ragione_sociale: string };
};

const CAMPI_IN_CORSO = "id, numero, riferimento_nts, stato_nts, id_frontiera, creato_il, in_invio_il, in_frontiera_il, cliente:clienti!inner(codice_nts, ragione_sociale)";

type RigaEmail = { cod_dav: string; descrizione: string; quantita: string | number; um: string | null; note: string | null };

export class Shop {
  private db: SupabaseClient;

  constructor(cfg: Config) {
    this.db = createClient(cfg.supabase.url, cfg.supabase.chiave, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  /** Claim atomico (FOR UPDATE SKIP LOCKED): fino a n ordini passano a 'in_invio' e arrivano con le righe. */
  async claim(n: number, prova: boolean): Promise<OrdineShop[]> {
    const { data, error } = await this.db.rpc("claim_ordini_nts", { n, p_prova: prova });
    if (error) throw new Error(`claim_ordini_nts: ${error.message}`);
    return (data ?? []) as OrdineShop[];
  }

  /** Passaggio di stato condizionato. false = l'ordine non era più in uno degli stati `da`. */
  async passa(id: number, da: StatoNts[], a: StatoNts, p: Passaggio = {}): Promise<boolean> {
    const { data, error } = await this.db.rpc("passa_stato_nts", {
      p_ordine_id: id,
      p_da: da,
      p_a: a,
      p_id_frontiera: p.idFrontiera ?? null,
      p_numero_nts: p.numeroNts ?? null,
      p_errore: p.errore ?? null,
      p_evento: p.evento ?? null,
      p_dettaglio: p.dettaglio ?? null,
      p_prova_ok: p.provaOk ?? false,
    });
    if (error) throw new Error(`passa_stato_nts: ${error.message}`);
    return data === true;
  }

  /** Riga nel registro dell'ordine senza cambiare stato (avvisi, tentativi falliti). */
  async log(ordineId: number, evento: string, dettaglio: string): Promise<void> {
    const { error } = await this.db.from("log_nts").insert({ ordine_id: ordineId, evento, dettaglio });
    if (error) throw new Error(`log_nts: ${error.message}`);
  }

  /** Ordini rimasti 'in_invio' da più di `minuti` (connettore caduto a metà). */
  async inInvioDaTroppo(minuti: number): Promise<OrdineInCorso[]> {
    const limite = new Date(Date.now() - minuti * 60000).toISOString();
    const { data, error } = await this.db.from("ordini").select(CAMPI_IN_CORSO).eq("stato_nts", "in_invio").lt("in_invio_il", limite).order("id").limit(50);
    if (error) throw new Error(`ordini in_invio: ${error.message}`);
    return normalizza(data);
  }

  /** Ordini scritti in frontiera da controllare: 'in_frontiera' e 'da_verificare' degli ultimi giorni. */
  async inAttesaDiEsito(giorniDaVerificare = 3): Promise<OrdineInCorso[]> {
    const limite = new Date(Date.now() - giorniDaVerificare * 86400000).toISOString();
    const { data, error } = await this.db
      .from("ordini")
      .select(CAMPI_IN_CORSO)
      .not("id_frontiera", "is", null)
      .or(`stato_nts.eq.in_frontiera,and(stato_nts.eq.da_verificare,in_frontiera_il.gt."${limite}")`)
      .order("id")
      .limit(100);
    if (error) throw new Error(`ordini in frontiera: ${error.message}`);
    return normalizza(data);
  }

  async righePerEmail(ordineId: number): Promise<RigaEmail[]> {
    const { data, error } = await this.db.from("righe_ordine").select("cod_dav, descrizione, quantita, um, note").eq("ordine_id", ordineId).order("id");
    if (error) return [];
    return (data ?? []) as RigaEmail[];
  }

  /** Codici di tutti gli articoli dello shop (per la giacenza). */
  async codiciArticoli(): Promise<string[]> {
    const out: string[] = [];
    for (let da = 0; ; da += 1000) {
      const { data, error } = await this.db.from("articoli").select("cod_dav").order("cod_dav").range(da, da + 999);
      if (error) throw new Error(`articoli: ${error.message}`);
      out.push(...(data ?? []).map((r) => r.cod_dav as string));
      if (!data || data.length < 1000) return out;
    }
  }

  /** Giacenze già nello shop, per scrivere solo quelle cambiate. */
  async giacenzeAttuali(): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    for (let da = 0; ; da += 1000) {
      const { data, error } = await this.db.from("giacenze").select("cod_dav, quantita").order("cod_dav").range(da, da + 999);
      if (error) throw new Error(`giacenze: ${error.message}`);
      for (const r of data ?? []) out.set(r.cod_dav as string, Number(r.quantita));
      if (!data || data.length < 1000) return out;
    }
  }

  async scriviGiacenze(righe: { cod_dav: string; quantita: number }[]): Promise<void> {
    const ora = new Date().toISOString();
    for (let i = 0; i < righe.length; i += 500) {
      const { error } = await this.db.from("giacenze").upsert(righe.slice(i, i + 500).map((r) => ({ ...r, aggiornato_il: ora })), { onConflict: "cod_dav" });
      if (error) throw new Error(`giacenze (lotto ${i}): ${error.message}`);
    }
  }

  /** Clienti abilitati scelti nello shop: [] = tutti, null = mai salvati (vale il .env). */
  async clientiAbilitati(): Promise<string[] | null> {
    const { data, error } = await this.db.from("impostazioni").select("valore").eq("chiave", CHIAVE_CLIENTI_NTS).maybeSingle();
    if (error) throw new Error(`clienti abilitati: ${error.message}`);
    return clientiDaImpostazione(data?.valore);
  }

  /** Heartbeat letto dal cruscotto dello shop (impostazioni.connettore_nts). */
  async heartbeat(valore: Record<string, unknown>): Promise<void> {
    const { error } = await this.db.from("impostazioni").upsert({ chiave: "connettore_nts", valore });
    if (error) throw new Error(`heartbeat: ${error.message}`);
  }
}

function normalizza(data: unknown): OrdineInCorso[] {
  type R = Omit<OrdineInCorso, "cliente" | "id_frontiera"> & { id_frontiera: number | string | null; cliente: OrdineInCorso["cliente"] | OrdineInCorso["cliente"][] };
  return ((data ?? []) as R[]).map((o) => ({
    ...o,
    id_frontiera: o.id_frontiera === null ? null : Number(o.id_frontiera),
    cliente: Array.isArray(o.cliente) ? o.cliente[0] : o.cliente,
  }));
}
