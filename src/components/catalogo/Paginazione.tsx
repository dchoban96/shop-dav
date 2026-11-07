import Link from "next/link";

type Props = { pagina: number; pagine: number; totale: number; base: Record<string, string | undefined> };

function url(base: Record<string, string | undefined>, pagina: number): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) if (v) p.set(k, v);
  if (pagina > 1) p.set("pagina", String(pagina));
  const s = p.toString();
  return `/catalogo${s ? `?${s}` : ""}`;
}

export function Paginazione({ pagina, pagine, totale, base }: Props) {
  const cls = "rounded-md border border-navy px-4 py-2 text-sm font-semibold text-navy hover:bg-ice";
  const disattivo = "rounded-md border border-azzurro/40 px-4 py-2 text-sm text-slate/60";
  return (
    <nav aria-label="Pagine" className="flex items-center justify-between gap-4 text-sm text-slate">
      <span>
        {totale} {totale === 1 ? "articolo" : "articoli"} · pagina {pagina} di {pagine}
      </span>
      <div className="flex gap-2">
        {pagina > 1 ? (
          <Link href={url(base, pagina - 1)} className={cls}>
            Precedente
          </Link>
        ) : (
          <span className={disattivo}>Precedente</span>
        )}
        {pagina < pagine ? (
          <Link href={url(base, pagina + 1)} className={cls}>
            Successiva
          </Link>
        ) : (
          <span className={disattivo}>Successiva</span>
        )}
      </div>
    </nav>
  );
}
