/**
 * Regole del brief (sezione 2): da un ordine dello shop alle righe da scrivere in frontiera.
 * Solo logica, niente rete: ogni violazione è un ErroreOrdine con un messaggio per l'ufficio.
 */

/** Colonna di SQL Server letta da sys.columns (lunghezza in caratteri, -1 = max). */
export type Colonna = { nome: string; tipo: string; precisione: number; scala: number; lunghezza: number };
export type Colonne = Map<string, Colonna>;

/** Errore dell'ordine (dati): non si riprova, l'ordine va in "errore" e l'ufficio riceve l'email. */
export class ErroreOrdine extends Error {
  override name = "ErroreOrdine";
}

export type RigaShop = {
  id: number;
  cod_dav: string;
  descrizione: string;
  quantita: string;
  um: string | null;
  prezzo_listino: string | null;
  sconto1: string;
  sconto2: string;
  prezzo_accordato: string | null;
  note: string | null;
};

export type OrdineShop = {
  id: number;
  numero: number;
  riferimento_nts: string | null;
  creato_il: string;
  data_consegna_richiesta: string | null;
  note: string | null;
  tentativi_nts: number;
  cliente: { id: number; codice_nts: string; ragione_sociale: string };
  righe: RigaShop[];
};

export type ArticoloNts = { codice: string; um: string; bloccato: boolean };

export type RigaFrontiera =
  | { tipo: "articolo"; nr: number; codice: string; quantita: number; prezzo: number; sconto1: number; sconto2: number; um: string }
  | { tipo: "nota"; nr: number; testo: string };

export type OrdinePreparato = {
  riferimento: string;
  conto: number;
  anno: number;
  dataDoc: Date;
  dataCons: Date | null;
  note: string;
  righe: RigaFrontiera[];
  /** Cose da annotare nel registro dell'ordine (es. testo troncato). */
  avvisi: string[];
};

const NUMERICI = new Set(["decimal", "numeric"]);
const INTERI = new Set(["int", "bigint", "smallint", "tinyint"]);
const TESTI = new Set(["varchar", "nvarchar", "char", "nchar"]);

/** Lunghezza massima in caratteri di una colonna di testo; null se illimitata o sconosciuta. */
export function lunghezzaMax(c: Colonna | undefined): number | null {
  if (!c || !TESTI.has(c.tipo) || c.lunghezza < 0) return null;
  return c.lunghezza;
}

/**
 * Arrotonda un numero scritto come testo ("38.488") a `scala` decimali, al valore più vicino
 * (la metà va verso l'alto in valore assoluto, come SQL Server). Lavora sulle cifre, senza virgola mobile.
 */
export function arrotondaDecimale(t: string, scala: number): string {
  const testo = t.trim();
  const negativo = testo.startsWith("-");
  const [intero, dec = ""] = testo.replace(/^-/, "").split(".");
  if (dec.length <= scala) return testo;
  const tenuto = BigInt((intero || "0") + dec.slice(0, scala));
  const v = tenuto + (Number(dec[scala]) >= 5 ? 1n : 0n);
  const cifre = v.toString().padStart(scala + 1, "0");
  const risultato = scala > 0 ? `${cifre.slice(0, -scala)}.${cifre.slice(-scala)}` : cifre;
  return (negativo && v !== 0n ? "-" : "") + risultato;
}

/**
 * Numero esatto (testo da Postgres, es. "5.2600") controllato contro la colonna SQL Server.
 * Gli zeri finali non contano; se servono più decimali di quelli della colonna è un errore.
 * Il prezzo viene arrotondato prima (vedi preparaOrdine); quantità e sconti no.
 */
export function controllaDecimale(testo: string | null, col: Colonna | undefined, cosa: string): number {
  const t = String(testo ?? "").trim();
  if (!/^-?\d+(\.\d+)?$/.test(t)) throw new ErroreOrdine(`${cosa}: valore non numerico "${testo ?? ""}"`);
  const [intero, dec = ""] = t.replace(/^-/, "").split(".");
  const decimali = dec.replace(/0+$/, "").length;
  if (col && NUMERICI.has(col.tipo)) {
    if (decimali > col.scala) {
      throw new ErroreOrdine(`${cosa}: ${t} ha più di ${col.scala} decimali (colonna ${col.nome}); non arrotondo in silenzio`);
    }
    if (intero.replace(/^0+/, "").length > col.precisione - col.scala) {
      throw new ErroreOrdine(`${cosa}: ${t} è troppo grande per la colonna ${col.nome}`);
    }
  }
  if (col && INTERI.has(col.tipo) && decimali > 0) {
    throw new ErroreOrdine(`${cosa}: ${t} ha decimali ma la colonna ${col.nome} è intera`);
  }
  return Number(t);
}

/** Codice cliente NTS (an_conto) come numero intero. */
export function contoNts(codice: string): number {
  const c = String(codice ?? "").trim();
  if (!/^\d{1,10}$/.test(c) || Number(c) > 2147483647 || Number(c) <= 0) {
    throw new ErroreOrdine(`Codice cliente "${codice}" non valido per NTS (serve il conto numerico)`);
  }
  return Number(c);
}

export function clienteAbilitato(codice: string, abilitati: string[]): boolean {
  return abilitati.length === 0 || abilitati.includes(String(codice).trim());
}

/** Data (anno, mese, giorno) di un istante nel fuso di Roma. */
export function dataRoma(iso: string): { anno: number; mese: number; giorno: number } {
  const t = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  const [anno, mese, giorno] = t.split("-").map(Number);
  return { anno, mese, giorno };
}

/** Anno NTS dell'ordine: quello della data documento (data dell'ordine a Roma). */
export function annoOrdine(creatoIl: string): number {
  return dataRoma(creatoIl).anno;
}

function dataGiorno(isoData: string): { anno: number; mese: number; giorno: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoData);
  if (!m) throw new ErroreOrdine(`Data non valida: "${isoData}"`);
  return { anno: Number(m[1]), mese: Number(m[2]), giorno: Number(m[3]) };
}

const due = (n: number) => String(n).padStart(2, "0");

/** NOTE della testata: nota del cliente + "Consegna richiesta: gg/mm/aaaa". */
export function noteTestata(nota: string | null, consegna: string | null): string {
  const n = (nota ?? "").replace(/\s+/g, " ").trim();
  if (!consegna) return n;
  const d = dataGiorno(consegna);
  const c = `Consegna richiesta: ${due(d.giorno)}/${due(d.mese)}/${d.anno}`;
  return n ? `${n} - ${c}` : c;
}

export type Contesto = {
  colTestata: Colonne;
  colRiga: Colonne;
  /** Articoli letti da DAVNTS.dbo.artico, chiave = codice in maiuscolo senza spazi. */
  articoli: Map<string, ArticoloNts>;
  usaDataCons: boolean;
};

export const chiaveArticolo = (c: string) => String(c ?? "").trim().toUpperCase();

/** Dall'ordine dello shop alla testata e alle righe di frontiera (ricetta collaudata del brief). */
export function preparaOrdine(o: OrdineShop, ctx: Contesto): OrdinePreparato {
  const avvisi: string[] = [];

  const riferimento = String(o.riferimento_nts ?? "");
  if (!/^SHOP-\d{6,}$/.test(riferimento)) throw new ErroreOrdine(`Riferimento non valido: "${riferimento}"`);
  const maxRif = Math.min(50, lunghezzaMax(ctx.colTestata.get("RIFERIMENTO")) ?? 50);
  if (riferimento.length > maxRif) throw new ErroreOrdine(`Riferimento ${riferimento} più lungo di ${maxRif} caratteri`);

  const conto = contoNts(o.cliente.codice_nts);
  if (!o.righe.length) throw new ErroreOrdine("Ordine senza righe");

  const g = dataRoma(o.creato_il);
  const dataDoc = new Date(g.anno, g.mese - 1, g.giorno);

  let note = noteTestata(o.note, o.data_consegna_richiesta);
  const maxNote = lunghezzaMax(ctx.colTestata.get("NOTE"));
  if (maxNote !== null && note.length > maxNote) {
    note = note.slice(0, maxNote);
    avvisi.push(`Nota d'ordine troncata a ${maxNote} caratteri`);
  }
  let dataCons: Date | null = null;
  if (ctx.usaDataCons && o.data_consegna_richiesta) {
    const c = dataGiorno(o.data_consegna_richiesta);
    dataCons = new Date(c.anno, c.mese - 1, c.giorno);
  }

  const maxCodice = lunghezzaMax(ctx.colRiga.get("CODICE_ART"));
  const maxUm = lunghezzaMax(ctx.colRiga.get("UM"));
  const maxDescr = Math.min(255, lunghezzaMax(ctx.colRiga.get("DESCRIZIONE")) ?? 255);
  const righe: RigaFrontiera[] = [];
  let nr = 0;

  for (const r of o.righe) {
    const cod = chiaveArticolo(r.cod_dav);
    const art = ctx.articoli.get(cod);
    if (!art) throw new ErroreOrdine(`Articolo ${cod} non trovato in NTS`);
    if (art.bloccato) throw new ErroreOrdine(`Articolo ${cod} bloccato in NTS`);
    if (maxCodice !== null && art.codice.length > maxCodice) throw new ErroreOrdine(`Codice articolo ${cod} troppo lungo per la frontiera`);

    // UM: quella principale di NTS (ar_unmis), letta adesso. Se lo shop ne ha un'altra la quantità non è affidabile.
    const um = art.um.trim();
    if (!um) throw new ErroreOrdine(`Articolo ${cod}: unità di misura vuota in NTS`);
    if (maxUm !== null && um.length > maxUm) throw new ErroreOrdine(`Articolo ${cod}: unità di misura "${um}" troppo lunga per la frontiera`);
    const umShop = (r.um ?? "").trim();
    if (umShop && umShop.toUpperCase() !== um.toUpperCase()) {
      throw new ErroreOrdine(`Articolo ${cod}: unità di misura diversa (shop ${umShop}, NTS ${um}), la quantità va controllata`);
    }

    const quantita = controllaDecimale(r.quantita, ctx.colRiga.get("QUANTITA"), `Quantità di ${cod}`);
    if (!(quantita > 0)) throw new ErroreOrdine(`Articolo ${cod}: quantità non valida (${r.quantita})`);

    // Prezzo accordato → quello, senza sconti. Altrimenti listino + sconti già calcolati dallo shop.
    let prezzoT: string;
    let s1T: string;
    let s2T: string;
    if (r.prezzo_accordato !== null && r.prezzo_accordato !== undefined) {
      prezzoT = r.prezzo_accordato;
      s1T = "0";
      s2T = "0";
    } else {
      if (r.prezzo_listino === null || r.prezzo_listino === undefined) throw new ErroreOrdine(`Articolo ${cod}: prezzo di listino mancante nello shop`);
      prezzoT = r.prezzo_listino;
      s1T = r.sconto1 ?? "0";
      s2T = r.sconto2 ?? "0";
    }
    // Il listino NTS ha fino a 6 decimali, la frontiera ne accetta meno (PREZZO decimal(11,2)):
    // il prezzo si arrotonda al centesimo più vicino (decisione del 10/11/2026) e l'arrotondamento resta nel registro.
    const colPrezzo = ctx.colRiga.get("PREZZO");
    let prezzoInviato = String(prezzoT ?? "").trim();
    if (colPrezzo && NUMERICI.has(colPrezzo.tipo) && /^-?\d+(\.\d+)?$/.test(prezzoInviato)) {
      const arrotondato = arrotondaDecimale(prezzoInviato, colPrezzo.scala);
      if (Number(arrotondato) !== Number(prezzoInviato)) {
        avvisi.push(`Prezzo di ${cod} arrotondato da ${Number(prezzoInviato)} a ${arrotondato} (la frontiera accetta ${colPrezzo.scala} decimali)`);
      }
      prezzoInviato = arrotondato;
    }
    const prezzo = controllaDecimale(prezzoInviato, colPrezzo, `Prezzo di ${cod}`);
    if (prezzo < 0) throw new ErroreOrdine(`Articolo ${cod}: prezzo negativo`);
    if (prezzo === 0) throw new ErroreOrdine(`Articolo ${cod}: prezzo zero (NTS metterebbe il listino senza le condizioni del cliente)`);
    const sconto1 = controllaDecimale(s1T, ctx.colRiga.get("SCONTO1"), `Sconto 1 di ${cod}`);
    const sconto2 = controllaDecimale(s2T, ctx.colRiga.get("SCONTO2"), `Sconto 2 di ${cod}`);
    for (const s of [sconto1, sconto2]) {
      if (s < 0 || s > 100) throw new ErroreOrdine(`Articolo ${cod}: sconto fuori dall'intervallo 0-100 (${s})`);
    }

    righe.push({ tipo: "articolo", nr: ++nr, codice: art.codice, quantita, prezzo, sconto1, sconto2, um });

    // Nota di riga: riga descrittiva 'D' subito dopo l'articolo, massimo 255 caratteri.
    const nota = (r.note ?? "").replace(/\s+/g, " ").trim();
    if (nota) {
      let testo = nota;
      if (testo.length > maxDescr) {
        testo = testo.slice(0, maxDescr);
        avvisi.push(`Nota della riga ${cod} troncata a ${maxDescr} caratteri`);
      }
      righe.push({ tipo: "nota", nr: ++nr, testo });
    }
  }

  return { riferimento, conto, anno: g.anno, dataDoc, dataCons, note, righe, avvisi };
}
