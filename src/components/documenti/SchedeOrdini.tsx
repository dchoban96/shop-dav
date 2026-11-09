import Link from "next/link";

export type Scheda = "ordini" | "ddt" | "fatture";

const schede: { id: Scheda; label: string; href: string }[] = [
  { id: "ordini", label: "Ordini", href: "/ordini" },
  { id: "ddt", label: "DDT", href: "/ordini?scheda=ddt" },
  { id: "fatture", label: "Fatture", href: "/ordini?scheda=fatture" },
];

export function leggiScheda(v: string | undefined): Scheda {
  return v === "ddt" || v === "fatture" ? v : "ordini";
}

/** Le tre schede di /ordini: semplici link, funzionano anche senza JavaScript. */
export function SchedeOrdini({ attiva }: { attiva: Scheda }) {
  return (
    <nav aria-label="Ordini e documenti" className="mt-6 flex gap-1 border-b border-azzurro/40">
      {schede.map((s) => {
        const sel = s.id === attiva;
        return (
          <Link
            key={s.id}
            href={s.href}
            aria-current={sel ? "page" : undefined}
            className={`-mb-px min-h-11 border-b-2 px-4 py-2.5 text-sm font-semibold ${sel ? "border-navy text-navy" : "border-transparent text-slate hover:text-navy"}`}
          >
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}
