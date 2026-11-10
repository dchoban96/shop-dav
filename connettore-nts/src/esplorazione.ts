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
  // Prima i parametri "di contorno" della funzione Graphite: contengono anche "art" o "list" nel nome.
  if (/variant/.test(n)) return { valore: "", motivo: "nessuna variante" };
  if (/cambio/.test(n)) return { valore: 0, motivo: "cambio 0 (euro)" };
  if (/nosconti/.test(n)) return { valore: 0, motivo: "0 = applica gli sconti di listino" };
  if (/invert|gamma/.test(n)) return { valore: 0, motivo: "0 = gestione predefinita" };
  if (/tipolist/.test(n)) return { valore: 1, motivo: "non usato dalla funzione" };
  if (/codice_?art|codart|articolo/.test(n) && c.articolo) return { valore: c.articolo, motivo: "articolo" };
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

// ---------------------------------------------------------------------------------------
// Supporto a `esplora-documenti` (DDT, fatture, note di credito, scadenze, pagamenti)
// ---------------------------------------------------------------------------------------

/** Nomi di oggetti candidati per scadenze, pagamenti, IVA, lotti, trasporto, agenti, destinazioni. */
export const MODELLO_OGGETTI_DOCUMENTI = [
  "%scad%", "%partit%", "%incas%", "%insol%", "%effet%", "%pagam%", "%tabpag%", "%iva%", "%cast%", "%lott%",
  "%vett%", "%caus%", "%trasp%", "%porto%", "%aspet%", "%dest%", "%tabcage%", "%zona%", "%tabcat%", "%valu%", "%testmag%", "%movmag%",
];

/** Parole da cercare nei nomi delle colonne di tutto DAVNTS (colonne che servono alla copia del documento). */
export const PAROLE_COLONNE = [
  "scad", "partit", "insol", "pagat", "incas", "residu", "lott", "rifddt", "rifbol", "ddt", "numbol", "rifor", "numord", "vett", "colli", "peso",
  "aspet", "porto", "caus", "protoc", "telem", "sdi", "destin", "codpag", "ratei", "rata",
];

/**
 * Colonne da NON mostrare mai nel file (e da non portare in Supabase): costi, margini, provvigioni,
 * fido, note interne. Il controllo è sul nome della colonna.
 */
export const RISERVATE = /cost|marg|provv|fido|affid|note|annot|memo|ricar|utile/i;

export function colonneAmmesse(colonne: string[]): string[] {
  return colonne.filter((c) => !RISERVATE.test(c));
}

/**
 * Colonne di una tabella che identificano un documento di magazzino (tipo, anno, serie, numero),
 * riconosciute dal suffisso del nome (tm_tipork, mm_numdoc, cm_anno, …). `null` se mancano anno o numero.
 */
export function chiaveDocumento(colonne: string[]): { tipork?: string; anno: string; serie?: string; numdoc: string } | null {
  const trova = (re: RegExp) => colonne.find((c) => re.test(c));
  const anno = trova(/_anno(doc)?$/i);
  const numdoc = trova(/_numdoc$/i);
  if (!anno || !numdoc) return null;
  return { tipork: trova(/_tipork$/i), anno, serie: trova(/_serie$/i), numdoc };
}

/** Colonne "conto cliente" e "data di scadenza" di una tabella (per le partite del cliente di prova). */
export function colonneScadenza(colonne: string[]): { conto: string[]; data: string | null } {
  return {
    conto: colonne.filter((c) => /conto$/i.test(c) || /_codcli$/i.test(c)),
    data: colonne.find((c) => /scad/i.test(c) && /dat/i.test(c)) ?? colonne.find((c) => /scad/i.test(c)) ?? null,
  };
}

/**
 * Colonne della testata da mostrare nell'elenco documenti di un cliente: chiave, data, conto e
 * tutto ciò che somiglia a totali, pagamento, colli, peso, agente, destinazione, causale, vettore.
 */
export function colonneElencoTestate(colonne: string[]): string[] {
  const fisse = /_(tipork|anno|serie|numdoc|datdoc|conto)$/i;
  const utili = /tot|impon|impos|iva|codpag|colli|peso|codage|dest|caus|vett|tipdoc|tipo|flag|stato|riv|rif/i;
  return colonneAmmesse(colonne).filter((c) => fisse.test(c) || utili.test(c)).slice(0, 30);
}

/** Record in verticale ("colonna: valore" per riga), per leggere una testata intera. */
export function verticale(r: Record<string, unknown>, salta: RegExp = RISERVATE): string[] {
  return Object.entries(r)
    .filter(([k]) => !salta.test(k))
    .map(([k, v]) => `  ${k.padEnd(24)} ${testo(v)}`);
}
