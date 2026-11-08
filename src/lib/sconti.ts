/**
 * Scontistica di una riga d'ordine, da mostrare al cliente e all'ufficio.
 * Puro: niente accesso ai dati, usabile anche nei componenti client e nelle email.
 *
 * Due casi, come in `prezzo_cliente`:
 * - sconti a cascata (sconto1, sconto2) sul listino: si mostrano così come sono ("15 % + 5 %");
 * - prezzo accordato: lo sconto è quello effettivo sul listino, calcolato ("−15 %").
 */
type Riga = {
  prezzo_listino: number | null;
  sconto1: number;
  sconto2: number;
  prezzo_accordato: number | null;
  prezzo_finale: number | null;
};

const pct = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 });

/** Percentuale di sconto effettiva sul listino (15 = 15 %), null se non c'è sconto. */
export function scontoEffettivo(r: Riga): number | null {
  if (r.prezzo_listino === null || r.prezzo_finale === null || r.prezzo_listino <= 0) return null;
  const p = (1 - r.prezzo_finale / r.prezzo_listino) * 100;
  return p >= 0.05 ? p : null;
}

/** Testo dello sconto di riga: "−15 %", "−10 % −5 %", oppure null se si paga il listino. */
export function testoSconto(r: Riga): string | null {
  const cascata = [r.sconto1, r.sconto2].filter((s) => s > 0);
  if (r.prezzo_accordato === null && cascata.length > 0) return cascata.map((s) => `−${pct.format(s)} %`).join(" ");
  const p = scontoEffettivo(r);
  return p === null ? null : `−${pct.format(p)} %`;
}

/** Totale a listino e risparmio dell'ordine, solo sulle righe con listino e prezzo. */
export function riepilogoSconti(righe: (Riga & { quantita: number })[]): { listino: number; risparmio: number } {
  let listino = 0;
  let netto = 0;
  for (const r of righe) {
    if (r.prezzo_listino === null || r.prezzo_finale === null) continue;
    listino += r.prezzo_listino * r.quantita;
    netto += r.prezzo_finale * r.quantita;
  }
  return { listino, risparmio: Math.max(0, listino - netto) };
}
