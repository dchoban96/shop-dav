/** Formati dei documenti NTS: date senza ora, quantità fino a 3 decimali, prezzi unitari a 3 decimali. */
import type { Documento } from "@/lib/dati/documenti";

const UTC = { timeZone: "UTC" } as const;
/** Separatore delle migliaia anche a 4 cifre (2.029,26 come le stampe di Business; Intl it-IT di suo scrive 2029,26). */
const MIGLIAIA = { useGrouping: "always" } as const;

/** Numero di documento o intero: 18.931. */
export function numero(v: number): string {
  return new Intl.NumberFormat("it-IT", MIGLIAIA).format(v);
}

/** Data di un documento o di una scadenza ("2026-10-27"): 27/10/2026. */
export function dataCorta(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("it-IT", { ...UTC, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));
}

/** 27 ottobre 2026. */
export function dataLunga(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("it-IT", { ...UTC, day: "numeric", month: "long", year: "numeric" }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));
}

/** "2026-10" → "ottobre 2026". */
export function nomeMese(mese: string): string {
  return new Intl.DateTimeFormat("it-IT", { ...UTC, month: "long", year: "numeric" }).format(new Date(`${mese}-01T00:00:00Z`));
}

export function euro(v: number | null): string {
  if (v === null) return "—";
  return new Intl.NumberFormat("it-IT", { ...MIGLIAIA, style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(v);
}

/** Prezzo unitario come in fattura: 3 decimali. */
export function prezzoUnitario(v: number | null): string {
  if (v === null) return "—";
  return new Intl.NumberFormat("it-IT", { ...MIGLIAIA, style: "currency", currency: "EUR", minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(v);
}

export function quantita(v: number | null): string {
  if (v === null) return "—";
  return new Intl.NumberFormat("it-IT", { ...MIGLIAIA, maximumFractionDigits: 3 }).format(v);
}

/** "10+5" → "10 + 5 %"; vuoto se non ci sono sconti. */
export function sconti(t: string | null): string | null {
  if (!t) return null;
  const parti = t.split("+").map((x) => x.trim()).filter((x) => x && Number(x.replace(",", ".")) !== 0);
  return parti.length ? `${parti.join(" + ")} %` : null;
}

export function percentuale(v: number | null): string {
  if (v === null) return "—";
  return `${new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(v)} %`;
}

/** Indirizzo della pagina del documento nell'area cliente. */
export function hrefDocumentoCliente(d: Pick<Documento, "id" | "tipo">): string {
  return d.tipo === "ddt" ? `/ordini/ddt/${d.id}` : `/ordini/fatture/${d.id}`;
}

export function hrefDocumentoAdmin(d: Pick<Documento, "id">): string {
  return `/admin/documenti/${d.id}`;
}
