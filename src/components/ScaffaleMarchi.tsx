import Link from "next/link";
import { LogoFornitore } from "./LogoFornitore";
import type { Marchio } from "@/lib/dati/catalogo";

/**
 * Scaffale dei marchi: card orizzontali tutte uguali (88 px di altezza), scatola logo a sinistra,
 * nome e riga di dettaglio a destra. Una per riga su telefono, due da sm, quattro da lg.
 * Senza logo, la scatola mostra la foto dell'articolo più venduto del marchio; senza nemmeno
 * quella, il nome breve in Baskerville (vedi `LogoFornitore`).
 */
export type TileMarchio = {
  id: number;
  nome: string;
  /** Logo del fornitore, oppure foto di ripiego. */
  immagine: string | null;
  dettaglio?: string | null;
  href?: string;
};

export function tileMarchio(m: Marchio, foto?: Map<number, string>, href = `/catalogo?marchio=${m.id}`): TileMarchio {
  return {
    id: m.id,
    nome: m.nome_breve ?? m.nome_nts,
    immagine: m.logo_path ?? foto?.get(m.id) ?? null,
    dettaglio: `${m.n_articoli} ${m.n_articoli === 1 ? "articolo" : "articoli"}`,
    href,
  };
}

type Props = { marchi: TileMarchio[]; mono?: boolean; colonne?: 3 | 4; className?: string };

export function ScaffaleMarchi({ marchi, mono = false, colonne = 4, className }: Props) {
  const griglia = colonne === 3 ? "sm:grid-cols-2 md:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4";
  const classi = "group flex h-22 items-center gap-3 rounded-lg border border-azzurro/40 bg-bianco px-4";
  return (
    <ul className={`grid gap-3 ${griglia} ${className ?? ""}`}>
      {marchi.map((m) => {
        const corpo = (
          <>
            <LogoFornitore nome={m.nome} logo={m.immagine} formato="riga" mono={mono} />
            <span className="min-w-0">
              <span className="line-clamp-2 text-sm font-semibold leading-tight">{m.nome}</span>
              {m.dettaglio && <span className="mt-0.5 block text-xs text-slate">{m.dettaglio}</span>}
            </span>
          </>
        );
        return (
          <li key={m.id}>
            {m.href ? (
              <Link href={m.href} className={`${classi} transition-colors hover:border-azzurro hover:bg-ice/60`}>
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
