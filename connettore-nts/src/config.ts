/**
 * Configurazione dal file .env nella cartella del connettore (mai nel repo).
 * Gli errori di configurazione fermano l'avvio con un messaggio chiaro.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const VERSIONE = "1.0.0";
export const DITTA = "DAVNTS";

export type Config = {
  mssql: { server: string; istanza?: string; porta?: number; utente: string; password: string; trustServerCertificate: boolean };
  supabase: { url: string; chiave: string };
  pollSecondi: number;
  prova: boolean;
  clientiAbilitati: string[];
  emailAllarmi: string;
  resendApiKey: string;
  emailMittente: string;
  appUrl: string;
  colonnaRiferimentoTestord: string | null;
  usaDataCons: boolean;
  simulaCrashDopoCommit: boolean;
  /** Ogni quanti minuti il servizio aggiorna la giacenza nello shop (0 = mai). */
  giacenzeMinuti: number;
};

export const CARTELLA = join(dirname(fileURLToPath(import.meta.url)), "..");

const si = (v: string | undefined) => /^(si|sì|true|1|yes)$/i.test((v ?? "").trim());

export function leggiConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const fileEnv = join(CARTELLA, ".env");
  if (env === process.env && existsSync(fileEnv)) process.loadEnvFile(fileEnv);

  const mancanti = ["MSSQL_SERVER", "MSSQL_USER", "MSSQL_PASSWORD", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !env[k]?.trim());
  if (mancanti.length) throw new Error(`Configurazione incompleta nel file .env: manca ${mancanti.join(", ")}`);

  const modalita = (env.MODALITA ?? "prova").trim().toLowerCase();
  if (modalita !== "prova" && modalita !== "reale") throw new Error(`MODALITA deve essere "prova" o "reale", non "${modalita}"`);

  // NOMESERVER\ISTANZA (istanza con nome) oppure host,porta
  const srv = env.MSSQL_SERVER!.trim();
  let server = srv;
  let istanza: string | undefined;
  let porta: number | undefined;
  if (srv.includes("\\")) [server, istanza] = srv.split("\\", 2);
  else if (srv.includes(",")) {
    const [h, p] = srv.split(",", 2);
    server = h;
    porta = Number(p);
  }

  const poll = Number(env.POLL_SECONDI ?? 30);
  const colonna = (env.TESTORD_COLONNA_RIFERIMENTO ?? "").trim();
  if (colonna && !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(colonna)) throw new Error("TESTORD_COLONNA_RIFERIMENTO non è un nome di colonna valido");

  return {
    mssql: {
      server,
      istanza,
      porta,
      utente: env.MSSQL_USER!.trim(),
      password: env.MSSQL_PASSWORD!,
      trustServerCertificate: (env.MSSQL_TRUST_SERVER_CERTIFICATE ?? "true").trim().toLowerCase() !== "false",
    },
    supabase: { url: env.SUPABASE_URL!.trim(), chiave: env.SUPABASE_SERVICE_ROLE_KEY!.trim() },
    pollSecondi: Number.isFinite(poll) && poll >= 5 ? poll : 30,
    prova: modalita === "prova",
    clientiAbilitati: (env.CLIENTI_ABILITATI ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    emailAllarmi: (env.EMAIL_ALLARMI ?? "info@davsnc.it").trim(),
    resendApiKey: (env.RESEND_API_KEY ?? "").trim(),
    emailMittente: (env.EMAIL_MITTENTE ?? "DAV Ordini <ordini@davsnc.it>").trim(),
    appUrl: (env.APP_URL ?? "").trim().replace(/\/$/, ""),
    colonnaRiferimentoTestord: colonna || null,
    usaDataCons: si(env.USA_DATA_CONS),
    simulaCrashDopoCommit: si(env.SIMULA_CRASH_DOPO_COMMIT),
    giacenzeMinuti: Number.isFinite(Number(env.GIACENZE_MINUTI ?? 15)) && Number(env.GIACENZE_MINUTI ?? 15) >= 0 ? Number(env.GIACENZE_MINUTI ?? 15) : 15,
  };
}

/** Riassunto da scrivere nel registro all'avvio: niente password né chiavi. */
export function descriviConfig(c: Config): string {
  return [
    `SQL Server ${c.mssql.server}${c.mssql.istanza ? `\\${c.mssql.istanza}` : ""}${c.mssql.porta ? `,${c.mssql.porta}` : ""} come ${c.mssql.utente}`,
    `modalità ${c.prova ? "PROVA (transazione annullata, niente in NTS)" : "REALE"}`,
    `giro ogni ${c.pollSecondi} s`,
    `giacenze ${c.giacenzeMinuti > 0 ? `ogni ${c.giacenzeMinuti} min` : "spente"}`,
    `clienti abilitati: ${c.clientiAbilitati.length ? c.clientiAbilitati.join(", ") : "tutti"}`,
    `email allarmi: ${c.emailAllarmi}${c.resendApiKey ? "" : " (RESEND_API_KEY vuota: solo registro)"}`,
    `colonna riferimento in testord: ${c.colonnaRiferimentoTestord ?? "non impostata"}`,
    `DATA_CONS: ${c.usaDataCons ? "sì" : "no"}`,
    ...(c.simulaCrashDopoCommit ? ["ATTENZIONE: SIMULA_CRASH_DOPO_COMMIT attivo (solo per il piano di prova)"] : []),
  ].join(" · ");
}
