import Link from "next/link";
import { LogoFornitore } from "./LogoFornitore";

/**
 * Lo "scaffale" dei marchi: griglia di tile identici (logo 2:1, nome breve, conteggio),
 * due per riga su telefono, tre o quattro da sm/lg. Stessa griglia in home cliente,
 * /partner e landing; cambia solo la sorgente dati e se i tile sono link.
 */
export type TileMarchio = {
  id: number;
  nome: string;
  logo: string | null;
  /** Riga piccola sotto il nome: "412 articoli" oppure la presentazione breve. */
  dettaglio?: string | null;
  href?: string;
};

type Props = { marchi: TileMarchio[]; mono?: boolean; colonne?: 3 | 4; className?: string };

export function ScaffaleMarchi({ marchi, mono = false, colonne = 4, className }: Props) {
  const griglia = colonne === 3 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4";
  return (
    <ul className={`grid gap-3 ${griglia} ${className ?? ""}`}>
      {marchi.map((m) => {
        const corpo = (
          <>
            <LogoFornitore nome={m.nome} logo={m.logo} formato="tile" mono={mono} />
            <span className="flex min-w-0 flex-col border-t border-ice px-3 py-2">
              <span className="line-clamp-2 text-sm font-semibold leading-tight">{m.nome}</span>
              {m.dettaglio && <span className="truncate text-xs text-slate">{m.dettaglio}</span>}
            </span>
          </>
        );
        const classi = "group flex flex-col overflow-hidden rounded-lg border border-azzurro/40 bg-bianco";
        return (
          <li key={m.id}>
            {m.href ? (
              <Link href={m.href} className={`${classi} hover:border-azzurro`}>
                {corpo}
              </Link>
            ) : (
              <div className={classi}>{corpo}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
