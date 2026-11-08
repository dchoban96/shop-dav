import { ETICHETTA_NTS } from "@/lib/dati/nts";
import type { StatoNts } from "@/lib/dati/ordini";

const STILE: Record<StatoNts, string> = {
  da_inviare: "border-azzurro text-slate",
  in_invio: "border-azzurro bg-ice text-navy",
  in_frontiera: "border-azzurro bg-ice text-navy",
  in_nts: "border-navy text-navy",
  da_verificare: "border-rosso text-rosso",
  errore: "border-rosso bg-rosso text-bianco",
  manuale: "border-navy text-navy",
};

/** Stato dell'ordine verso NTS. Errore e da verificare in rosso: sono quelli da controllare. */
export function BadgeNts({ stato }: { stato: StatoNts | null }) {
  if (!stato) return <span className="text-xs text-slate">—</span>;
  return (
    <span className={`inline-block whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-semibold ${STILE[stato]}`}>
      {ETICHETTA_NTS[stato]}
    </span>
  );
}
