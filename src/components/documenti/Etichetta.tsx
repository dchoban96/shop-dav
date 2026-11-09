import type { StatoPagamento, Scadenza } from "@/lib/dati/documenti";

/**
 * Etichetta di stato sobria (brand: niente rosso o verde pieni).
 * - tenue: bordo azzurro, testo slate (pagata, informazioni secondarie);
 * - normale: bordo navy (da pagare);
 * - forte: fondo navy, testo bianco (scaduta, insoluta).
 */
type Tono = "tenue" | "normale" | "forte";

const toni: Record<Tono, string> = {
  tenue: "border-azzurro/60 text-slate",
  normale: "border-navy text-navy",
  forte: "border-navy bg-navy text-bianco",
};

export function Etichetta({ children, tono = "normale" }: { children: string; tono?: Tono }) {
  return <span className={`inline-flex shrink-0 items-center rounded border px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${toni[tono]}`}>{children}</span>;
}

export function EtichettaPagamento({ stato }: { stato: StatoPagamento }) {
  if (stato === null) return null;
  if (stato === "pagata") return <Etichetta tono="tenue">Pagata</Etichetta>;
  if (stato === "scaduta") return <Etichetta tono="forte">Scaduta</Etichetta>;
  return <Etichetta>Da pagare</Etichetta>;
}

export function EtichettaScadenza({ s }: { s: Pick<Scadenza, "stato" | "scaduta"> }) {
  if (s.stato === "pagata") return <Etichetta tono="tenue">Pagata</Etichetta>;
  if (s.stato === "insoluta") return <Etichetta tono="forte">Insoluta</Etichetta>;
  if (s.scaduta) return <Etichetta tono="forte">Scaduta</Etichetta>;
  return <Etichetta>Da pagare</Etichetta>;
}
