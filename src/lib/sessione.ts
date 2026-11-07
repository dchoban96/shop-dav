/**
 * Sessione: cookie firmato (HMAC) letto solo lato server, con ruolo `cliente` o `admin`.
 *
 * ACCESSO DEMO CLIENTE (provvisorio, fino a Supabase Auth con invito): codice cliente
 * usato sia come login sia come password.
 * - In produzione sono accettati solo i codici elencati in DEMO_CODICI_CLIENTE.
 * - In sviluppo, senza quella variabile, va bene qualsiasi codice di 3–12 caratteri.
 *
 * ACCESSO ADMIN (ufficio DAV): una password unica in ADMIN_PASSWORD (minimo 12 caratteri).
 * Senza quella variabile l'area admin resta chiusa, anche in sviluppo.
 *
 * Formato del cookie: `<ruolo>:<identificativo>|<scadenza ms>|<firma>`.
 * I cookie precedenti, senza ruolo, valgono come sessione cliente.
 */
import { cookies } from "next/headers";
import { connection } from "next/server";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const NOME_COOKIE = "dav_sessione";
const DURATA_CLIENTE = 60 * 60 * 24 * 7;
const DURATA_ADMIN = 60 * 60 * 12;

export type Ruolo = "cliente" | "admin";
export type Sessione = { codiceCliente: string; demo: boolean; ruolo: Ruolo };

function segreto(): string {
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET mancante o troppo corto (minimo 16 caratteri)");
  }
  return "segreto-di-sviluppo-non-usare-in-produzione";
}

function firma(payload: string): string {
  return createHmac("sha256", segreto()).update(payload).digest("base64url");
}

/** Confronto a tempo costante tra stringhe di lunghezza qualsiasi. */
function uguali(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function normalizzaCodice(input: unknown): string {
  return String(input ?? "")
    .trim()
    .toUpperCase();
}

export function codiceDemoValido(codice: string): boolean {
  if (!/^[A-Z0-9._-]{3,12}$/.test(codice)) return false;
  const lista = (process.env.DEMO_CODICI_CLIENTE ?? "")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  if (lista.length > 0) return lista.includes(codice);
  return process.env.NODE_ENV !== "production";
}

export function adminConfigurato(): boolean {
  return (process.env.ADMIN_PASSWORD ?? "").length >= 12;
}

export function passwordAdminValida(password: string): boolean {
  const attesa = process.env.ADMIN_PASSWORD ?? "";
  if (attesa.length < 12) return false;
  return uguali(password, attesa);
}

async function scriviCookie(ruolo: Ruolo, id: string, durata: number): Promise<void> {
  const scade = Date.now() + durata * 1000;
  const payload = `${ruolo}:${id}|${scade}`;
  (await cookies()).set(NOME_COOKIE, `${payload}|${firma(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: durata,
  });
}

export async function creaSessione(codiceCliente: string): Promise<void> {
  await scriviCookie("cliente", codiceCliente, DURATA_CLIENTE);
}

export async function creaSessioneAdmin(): Promise<void> {
  await scriviCookie("admin", "ufficio", DURATA_ADMIN);
}

export async function leggiSessione(): Promise<Sessione | null> {
  // La scadenza dipende dall'ora corrente: la lettura avviene solo a richiesta, mai in prerender.
  await connection();
  const valore = (await cookies()).get(NOME_COOKIE)?.value;
  if (!valore) return null;
  const [testa, scade, firmaRicevuta] = valore.split("|");
  if (!testa || !scade || !firmaRicevuta) return null;
  const attesa = Buffer.from(firma(`${testa}|${scade}`));
  const ricevuta = Buffer.from(firmaRicevuta);
  if (attesa.length !== ricevuta.length || !timingSafeEqual(attesa, ricevuta)) return null;
  if (Number(scade) < Date.now()) return null;

  const due = testa.indexOf(":");
  const ruolo: Ruolo = due > 0 && testa.slice(0, due) === "admin" ? "admin" : "cliente";
  const id = due > 0 ? testa.slice(due + 1) : testa;
  return { codiceCliente: id, demo: ruolo === "cliente", ruolo };
}

export async function leggiSessioneAdmin(): Promise<Sessione | null> {
  const s = await leggiSessione();
  return s?.ruolo === "admin" ? s : null;
}

export async function cancellaSessione(): Promise<void> {
  (await cookies()).delete(NOME_COOKIE);
}
