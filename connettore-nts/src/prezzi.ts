/**
 * Regole dell'import prezzi da NTS (decise con l'ufficio il 10/11/2026). Solo logica, niente rete.
 *
 * Per ogni cliente e articolo vince la prima che vale:
 *  1. storico (ultima riga di ordini, DDT, fatture degli ultimi 300 giorni, come Graphite):
 *     - senza sconti e prezzo SOTTO il listino di oggi del cliente → prezzo speciale concordato (fisso);
 *     - con sconti → gli stessi sconti sul listino di oggi (2,28 −15 % nel 2025 → oggi 2,36 −15 % = 2,01);
 *     - senza sconti e prezzo uguale o sopra il listino → nessuna condizione dallo storico;
 *  2. prezzo netto personale valido oggi in NTS (listini.lc_conto = cliente);
 *  3. sconto cliente × articolo valido oggi in NTS (sconti.so_conto = cliente, so_codart);
 *  4. altrimenti listino del cliente con gli sconti di listino (non serve una condizione).
 * Gli sconti oltre il secondo si combinano nel secondo; se il risultato ha più di 2 decimali
 * la condizione si scarta (la frontiera accetta 2 decimali) e il rapporto lo segnala.
 */

export type Origine = "storico_ps" | "storico_sconto" | "nts_prezzo" | "nts_sconto";

export type RigaStorico = { data: Date; doc: string; prezzo: number; sconti: number[] };
export type PrezzoPersonale = { prezzo: number; dal: Date | null; al: Date | null };
export type ScontoCliente = { sconti: number[]; dal: Date | null; al: Date | null };

export type Condizione = {
  origine: Origine;
  prezzo_accordato: number | null;
  sconto1: number;
  sconto2: number;
  valido_dal: string | null;
  valido_al: string | null;
  rif: string | null;
};

export type Scarto = { motivo: string };

/** Arrotonda al centesimo più vicino (metà verso l'alto), senza errori di virgola mobile visibili. */
export function centesimi(n: number): number {
  return Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9) / 100;
}

const haDuedecimali = (x: number) => Math.abs(x * 100 - Math.round(x * 100)) < 1e-6;
const pulito = (x: number) => Math.round(x * 1e6) / 1e6;

/**
 * Riduce gli sconti NTS (fino a 6) ai due della frontiera: il primo resta, gli altri diventano un unico
 * sconto equivalente (5 % + 5 % → 9,75 %). null se lo sconto equivalente ha più di 2 decimali.
 */
export function combinaSconti(sconti: number[]): { sconto1: number; sconto2: number } | null {
  const s = sconti.map((x) => Number(x) || 0);
  const sconto1 = pulito(s[0] ?? 0);
  const resto = s.slice(1).filter((x) => x !== 0);
  const sconto2 = resto.length ? pulito(100 * (1 - resto.reduce((acc, x) => acc * (1 - x / 100), 1))) : 0;
  if (!haDuedecimali(sconto1) || !haDuedecimali(sconto2)) return null;
  if (sconto1 < 0 || sconto1 > 100 || sconto2 < 0 || sconto2 > 100) return null;
  return { sconto1, sconto2 };
}

const isoGiorno = (d: Date | null) =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : null;
const gg = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
const euro = (n: number) => n.toFixed(2).replace(".", ",");
const pct = (sc: number[]) => sc.filter((x) => x).map((x) => `−${String(x).replace(".", ",")} %`).join(" ");

/** Testo che spiega da dove viene la condizione (va in condizioni_cliente.rif_storico). */
export function rifStorico(s: RigaStorico): string {
  return `${s.doc} del ${gg(s.data)}: ${euro(s.prezzo)}${pct(s.sconti) ? ` ${pct(s.sconti)}` : ""}`;
}

/** Fine dell'anno 2099 o simili: in Supabase "senza scadenza" è null. */
const scadenza = (d: Date | null) => (d && d.getFullYear() < 2090 ? d : null);

/**
 * Condizione per un cliente e un articolo. `listino` = prezzo di listino di oggi del cliente, già al
 * centesimo (null se l'articolo non è nel suo listino). Restituisce null se vale il listino.
 */
export function risolvi(
  listino: number | null,
  storico: RigaStorico | null,
  personale: PrezzoPersonale | null,
  sconto: ScontoCliente | null,
): { condizione: Condizione | null; scarti: Scarto[] } {
  const scarti: Scarto[] = [];

  if (storico) {
    const conSconti = storico.sconti.some((x) => x !== 0);
    if (!conSconti) {
      if (listino === null || storico.prezzo < listino - 0.0001) {
        return {
          condizione: { origine: "storico_ps", prezzo_accordato: centesimi(storico.prezzo), sconto1: 0, sconto2: 0, valido_dal: isoGiorno(storico.data), valido_al: null, rif: rifStorico(storico) },
          scarti,
        };
      }
      // prezzo pieno (o sopra il listino): dallo storico nessuna condizione, si guardano quelle NTS
    } else if (listino === null) {
      // senza listino non si possono riapplicare gli sconti: il netto dello storico diventa prezzo fisso
      const netto = centesimi(storico.prezzo * storico.sconti.reduce((acc, x) => acc * (1 - x / 100), 1));
      return {
        condizione: { origine: "storico_ps", prezzo_accordato: netto, sconto1: 0, sconto2: 0, valido_dal: isoGiorno(storico.data), valido_al: null, rif: `${rifStorico(storico)} (articolo senza listino: netto fisso)` },
        scarti,
      };
    } else {
      const c = combinaSconti(storico.sconti);
      if (c) {
        return {
          condizione: { origine: "storico_sconto", prezzo_accordato: null, ...c, valido_dal: isoGiorno(storico.data), valido_al: null, rif: rifStorico(storico) },
          scarti,
        };
      }
      scarti.push({ motivo: `sconti dello storico non riducibili a 2 decimali (${storico.sconti.join(" + ")})` });
    }
  }

  if (personale) {
    return {
      condizione: { origine: "nts_prezzo", prezzo_accordato: centesimi(personale.prezzo), sconto1: 0, sconto2: 0, valido_dal: isoGiorno(personale.dal), valido_al: isoGiorno(scadenza(personale.al)), rif: null },
      scarti,
    };
  }

  if (sconto && sconto.sconti.some((x) => x !== 0)) {
    const c = combinaSconti(sconto.sconti);
    if (c) {
      return { condizione: { origine: "nts_sconto", prezzo_accordato: null, ...c, valido_dal: isoGiorno(sconto.dal), valido_al: isoGiorno(scadenza(sconto.al)), rif: null }, scarti };
    }
    scarti.push({ motivo: `sconti NTS non riducibili a 2 decimali (${sconto.sconti.join(" + ")})` });
  }

  return { condizione: null, scarti };
}

/** Numero di listino effettivo del cliente: 0 o assente → 2 (come Graphite, ListinoVen1=2). */
export function listinoCliente(anListino: number | null | undefined): number {
  const n = Number(anListino ?? 0);
  return n > 0 ? n : 2;
}
