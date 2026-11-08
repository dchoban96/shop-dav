"use client";

import { useState } from "react";

/** Bottone che copia un testo negli appunti (es. il riferimento SHOP-000123 da cercare in NTS). */
export function CopiaTesto({ testo, etichetta = "Copia" }: { testo: string; etichetta?: string }) {
  const [copiato, setCopiato] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(testo);
          setCopiato(true);
          setTimeout(() => setCopiato(false), 2000);
        } catch {
          window.prompt("Copia il testo:", testo);
        }
      }}
      className="rounded-md border border-navy px-3 py-1.5 text-xs font-semibold text-navy hover:bg-ice"
    >
      {copiato ? "Copiato" : etichetta}
    </button>
  );
}
