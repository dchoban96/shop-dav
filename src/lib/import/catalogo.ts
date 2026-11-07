/**
 * Import "catalogo": articoli_catalogo.csv (separatore ;, UTF-8 con BOM)
 * COD_DAV;DESCRIZIONE;FORNITORE;FATTURATO_12M;TOP80;FAMIGLIA
 *
 * Alimenta fornitori, famiglie, articoli (senza listino: arriva dall'anagrafica NTS).
 * Idempotente: upsert per cod_dav; chi manca dal file → attivo = false, mai cancellato.
 * Logica pura (nessun accesso a rete o file): testabile in locale.
 */
import { parse } from "csv-parse/sync";

export type RigaCatalogo = {
  cod_dav: string;
  descrizione: string;
  fornitore: string;
  fatturato_12m: number | null;
  top80: boolean;
  famiglia: string;
};

export type ErroreRiga = { riga: number; errore: string; dati?: Record<string, string> };

export function leggiCatalogo(testo: string): { righe: RigaCatalogo[]; errori: ErroreRiga[] } {
  const records = parse(testo.replace(/^﻿/, ""), {
    delimiter: ";",
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as Record<string, string>[];

  const righe: RigaCatalogo[] = [];
  const errori: ErroreRiga[] = [];
  const visti = new Set<string>();

  records.forEach((r, i) => {
    const n = i + 2; // riga del file, intestazione = 1
    const cod = (r.COD_DAV ?? "").trim();
    if (!cod) return errori.push({ riga: n, errore: "COD_DAV vuoto", dati: r });
    if (visti.has(cod)) return errori.push({ riga: n, errore: `COD_DAV duplicato: ${cod}`, dati: r });
    if (!(r.DESCRIZIONE ?? "").trim()) return errori.push({ riga: n, errore: "DESCRIZIONE vuota", dati: r });
    visti.add(cod);
    righe.push({
      cod_dav: cod,
      descrizione: r.DESCRIZIONE.trim(),
      fornitore: (r.FORNITORE ?? "").trim() || "SCONOSCIUTO",
      fatturato_12m: numero(r.FATTURATO_12M),
      top80: (r.TOP80 ?? "").trim().toUpperCase() === "SI",
      famiglia: (r.FAMIGLIA ?? "").trim() || "Senza famiglia",
    });
  });

  return { righe, errori };
}

function numero(v: string | undefined): number | null {
  if (v == null || v.trim() === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Nome commerciale breve: senza forma societaria e punteggiatura finale. */
export function nomeBreve(nomeNts: string): string {
  let n = nomeNts.trim();
  n = n.replace(/\b(S\.?R\.?L\.?|S\.?P\.?A\.?|S\.?N\.?C\.?|S\.?A\.?S\.?|S\.?S\.?|&\s*C\.?|SOC\.?\s*COOP\.?|COOP\.?|DI\s+[A-Z].*)$/i, "");
  n = n.replace(/[\s.,&-]+$/, "").trim();
  return n.length >= 2 ? capitalizza(n) : capitalizza(nomeNts.trim());
}

function capitalizza(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((p) => (p.length <= 3 && /^[a-z0-9.]+$/.test(p) && p.length <= 2 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}

/**
 * Sigle finali per fornitore (STRUTTURA, sezione 4): l'ultima parola della descrizione
 * conta come sigla solo se ricorre in almeno il 20 % degli articoli del fornitore,
 * non contiene cifre con unità (KG., PZ., LT., GR., X) e ha 2–12 caratteri.
 */
export function calcolaSigle(righe: RigaCatalogo[]): Map<string, string[]> {
  const perFornitore = new Map<string, Map<string, number>>();
  const totali = new Map<string, number>();
  for (const r of righe) {
    totali.set(r.fornitore, (totali.get(r.fornitore) ?? 0) + 1);
    const ultima = r.descrizione.split(/\s+/).pop()?.toUpperCase();
    if (!ultima || !sembraSigla(ultima)) continue;
    const m = perFornitore.get(r.fornitore) ?? new Map<string, number>();
    m.set(ultima, (m.get(ultima) ?? 0) + 1);
    perFornitore.set(r.fornitore, m);
  }
  const out = new Map<string, string[]>();
  for (const [forn, conteggi] of perFornitore) {
    const tot = totali.get(forn) ?? 1;
    const sigle = [...conteggi.entries()]
      .filter(([, n]) => n >= 2 && n / tot >= 0.2)
      .sort((a, b) => b[1] - a[1])
      .map(([s]) => s);
    if (sigle.length) out.set(forn, sigle);
  }
  return out;
}

function sembraSigla(t: string): boolean {
  if (t.length < 2 || t.length > 12) return false;
  if (/^(KG|GR|G|LT|L|ML|PZ|CL|CM|MM|MT|M|X|N|H)\.?\d/.test(t)) return false; // pesi e formati
  if (/^\d+(X\d+)*$/.test(t)) return false;                                  // 1X6, 36PZ…
  if (/^\d+[A-Z]{0,2}$/.test(t)) return false;                              // 405PZ
  if (/^[A-Z]{1,3}\.?\d/.test(t)) return false;                              // FG.500, H.4, D20
  if (!/[A-Z]{2}/.test(t)) return false;                                     // almeno due lettere
  return /^[A-Z0-9.&'-]+$/.test(t);
}

/** Stessa regola della funzione SQL public.descrizione_pulita. */
export function descrizionePulita(descrizione: string, sigle: string[]): string {
  let d = descrizione.trim();
  const pos = d.toUpperCase().indexOf("ART.");
  if (pos >= 0) {
    d = d.slice(0, pos).trim();
    if (d.endsWith("-")) d = d.slice(0, -1).trim();
    return d;
  }
  const m = d.match(/(\S+)\s*$/);
  if (m && sigle.includes(m[1].toUpperCase())) {
    d = d.slice(0, d.length - m[1].length).trim();
  }
  return d;
}

/** Cartelle foto già esistenti per i fornitori del pilota (nome NTS → cartella). */
export const CARTELLE_FOTO: Record<string, string> = {
  IRCA: "IRCA",
  "IRCA DISTRIBUZIONE": "IRCA",
  "DELIFRANCE ITALIA": "DELIFRANCE",
};
