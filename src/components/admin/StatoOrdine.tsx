import { ETICHETTA_STATO, type StatoOrdine } from "@/lib/dati/ordini";

const STILE: Record<StatoOrdine, string> = {
  bozza: "border-azzurro/60 text-slate",
  inviato: "border-navy bg-navy text-bianco",
  confermato: "border-navy text-navy",
  inserito_nts: "border-azzurro bg-ice text-navy",
  consegnato: "border-azzurro/60 text-slate",
  annullato: "border-azzurro/60 text-slate line-through",
};

/** Etichetta di stato: si distingue per forma e testo, non per colore (brand: niente verde/rosso). */
export function BadgeStato({ stato }: { stato: StatoOrdine }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-semibold ${STILE[stato]}`}>
      {ETICHETTA_STATO[stato]}
    </span>
  );
}
