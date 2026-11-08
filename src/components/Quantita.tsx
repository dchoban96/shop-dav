"use client";

import { useState } from "react";
import { IconaMeno, IconaPiu } from "@/components/Icone";

type Props = {
  /** Nome del campo inviato dal form (es. `qta:COD`). */
  name: string;
  id: string;
  iniziale: number;
  min?: number;
  /** Di cosa è la quantità, per gli screen reader. */
  etichetta: string;
  /** Unità (KG, PZ, conf.): mostrata accanto al numero. */
  um?: string | null;
};

const tondo = "flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-bianco transition-colors disabled:opacity-40";

/**
 * Quantità con − e +: funziona anche senza JavaScript (il campo numerico resta
 * modificabile), con JavaScript i due tasti cambiano il valore senza ricaricare.
 */
export function Quantita({ name, id, iniziale, min = 0, etichetta, um }: Props) {
  const [valore, setValore] = useState(Math.max(min, Math.round(iniziale)));
  const cambia = (d: number) => setValore((v) => Math.max(min, v + d));
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => cambia(-1)}
        disabled={valore <= min}
        className={`${tondo} bg-rosso hover:bg-[#9a362e]`}
        aria-label={`Una in meno: ${etichetta}`}
      >
        <IconaMeno />
      </button>
      <label htmlFor={id} className="sr-only">
        Quantità {etichetta}
      </label>
      <input
        id={id}
        name={name}
        type="number"
        min={min}
        step={1}
        value={valore}
        onChange={(e) => setValore(Math.max(min, Math.round(Number(e.target.value) || 0)))}
        inputMode="numeric"
        className="h-10 w-14 rounded-md border border-azzurro bg-bianco text-center text-base"
      />
      <button type="button" onClick={() => cambia(1)} className={`${tondo} bg-verde hover:bg-[#25714a]`} aria-label={`Una in più: ${etichetta}`}>
        <IconaPiu />
      </button>
      {um && <span className="etichetta w-10 text-center normal-case tracking-normal">{um}</span>}
    </div>
  );
}
