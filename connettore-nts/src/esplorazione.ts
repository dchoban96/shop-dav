/**
 * Funzioni di supporto (senza rete) per `esplora-prezzi`: nomi SQL quotati, valori di prova
 * per i parametri della funzione prezzo di Graphite, filtri sulle colonne da mostrare.
 */

/** Nome SQL tra parentesi quadre (i nomi arrivano da sys.objects / sys.columns, mai dall'utente). */
export function quota(nome: string): string {
  return `[${nome.replace(/]/g, "]]")}]`;
}

export type Parametro = { nome: string; tipo: string };
export type CasoProva = { cliente: number | null; articolo: string | null; um: string | null; listino: number; ditta: string; oggi: Date };

/**
 * Valore di prova per un parametro della funzione, dedotto dal nome.
 * Restituisce `undefined` se il nome non dice niente: il parametro va a NULL e il file lo segnala.
 */
export function valorePerParametro(p: Parametro, c: CasoProva): { valore: unknown; motivo: string } | undefined {
  const n = p.nome.replace(/^@/, "").toLowerCase();
  const t = p.tipo.toLowerCase();
  if (/ditta|codditt/.test(n)) return { valore: c.ditta, motivo: "ditta" };
  if (/art|cod_?ar/.test(n) && c.articolo) return { valore: c.articolo, motivo: "articolo" };
  if (/conto|cli|anagr/.test(n) && c.cliente !== null) return { valore: c.cliente, motivo: "cliente" };
  if (/list/.test(n)) return { valore: c.listino, motivo: "listino" };
  if (/dat|giorno/.test(n) || /date|time/.test(t)) return { valore: c.oggi, motivo: "data di oggi" };
  if (/quan|qta|qt$/.test(n)) return { valore: 1, motivo: "quantità 1" };
  if (/unmis|^um|_um/.test(n) && c.um) return { valore: c.um, motivo: "UM dell'articolo" };
  if (/valu|divis/.test(n)) return { valore: 0, motivo: "valuta 0 (euro)" };
  return undefined;
}

/** Colonne che contengono codice articolo o conto cliente, per filtrare le tabelle sul caso di prova. */
export function colonneChiave(colonne: string[]): { articolo: string[]; cliente: string[] } {
  return {
    articolo: colonne.filter((c) => /codart$/i.test(c)),
    cliente: colonne.filter((c) => /conto$/i.test(c) || /_codcli$/i.test(c)),
  };
}

/** Colonne di anagra/artico utili per i prezzi: niente indirizzi, P. IVA o contatti nel file. */
export function colonnePrezzi(colonne: string[], tabella: "anagra" | "artico"): string[] {
  const base = tabella === "anagra" ? /^(an_conto|an_descr1)$/i : /^(ar_codart|ar_descr|ar_unmis|ar_famprod|ar_blocco)$/i;
  const prezzi = /list|scon|clsc|clas|cls|prz|prez|contr|promo|fam|grup|marc|categ|sott/i;
  return colonne.filter((c) => base.test(c) || prezzi.test(c));
}

/** Nomi di oggetti candidati per listini, sconti, prezzi e Graphite. */
export const MODELLO_OGGETTI = ["%GPH%", "%FNMG%", "%listin%", "%scont%", "%prez%", "%prz%", "%contrat%", "%promo%", "%clsc%"];

/** Valore leggibile per il file (date in ora locale, numeri senza notazione esponenziale). */
export function testo(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(v.getDate())}/${p(v.getMonth() + 1)}/${v.getFullYear()} ${p(v.getHours())}:${p(v.getMinutes())}`;
  }
  if (typeof v === "number") return String(v);
  if (Buffer.isBuffer(v)) return `<binario ${v.length} byte>`;
  return String(v).trimEnd();
}

/** Tabella di testo semplice (colonne allineate) per il file. */
export function tabellaTesto(righe: Record<string, unknown>[], max = 50): string[] {
  if (!righe.length) return ["  (nessuna riga)"];
  const cols = Object.keys(righe[0]);
  const celle = righe.slice(0, max).map((r) => cols.map((c) => testo(r[c]).slice(0, 60)));
  const larg = cols.map((c, i) => Math.min(60, Math.max(c.length, ...celle.map((r) => r[i].length))));
  const riga = (v: string[]) => "  " + v.map((x, i) => x.padEnd(larg[i])).join(" | ");
  const out = [riga(cols), "  " + larg.map((l) => "-".repeat(l)).join("-+-"), ...celle.map(riga)];
  if (righe.length > max) out.push(`  … altre ${righe.length - max} righe non mostrate`);
  return out;
}
