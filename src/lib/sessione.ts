/**
 * Sessione cliente: cookie firmato (HMAC) letto solo lato server.
 *
 * ACCESSO DEMO (provvisorio, fino a Supabase Auth con invito): il cliente entra
 * con il proprio codice cliente usato sia come login sia come password.
 * - In produzione sono accettati solo i codici elencati in DEMO_CODICI_CLIENTE.
 * - In sviluppo, senza quella variabile, va bene qualsiasi codice di 3–12 caratteri.
 * Quando arriva l'autenticazione vera, questo file resta per la lettura della
 * sessione e `codiceDemoValido` sparisce.
 */
import { cookies } from "next/headers";
import { connection } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";

const NOME_COOKIE = "dav_sessione";
const DURATA_SECONDI = 60 * 60 * 24 * 7;

export type Sessione = { codiceCliente: string; demo: boolean };

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

export async function creaSessione(codiceCliente: string): Promise<void> {
  const scade = Date.now() + DURATA_SECONDI * 1000;
  const payload = `${codiceCliente}|${scade}`;
  (await cookies()).set(NOME_COOKIE, `${payload}|${firma(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DURATA_SECONDI,
  });
}

export async function leggiSessione(): Promise<Sessione | null> {
  // La scadenza dipende dall'ora corrente: la lettura avviene solo a richiesta, mai in prerender.
  await connection();
  const valore = (await cookies()).get(NOME_COOKIE)?.value;
  if (!valore) return null;
  const [codice, scade, firmaRicevuta] = valore.split("|");
  if (!codice || !scade || !firmaRicevuta) return null;
  const attesa = Buffer.from(firma(`${codice}|${scade}`));
  const ricevuta = Buffer.from(firmaRicevuta);
  if (attesa.length !== ricevuta.length || !timingSafeEqual(attesa, ricevuta)) return null;
  if (Number(scade) < Date.now()) return null;
  return { codiceCliente: codice, demo: true };
}

export async function cancellaSessione(): Promise<void> {
  (await cookies()).delete(NOME_COOKIE);
}
