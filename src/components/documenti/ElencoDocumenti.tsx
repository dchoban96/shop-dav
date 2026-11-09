import Link from "next/link";
import type { ReactNode } from "react";
import { type DocumentoElenco, type ElencoDocumenti as Elenco, titoloDocumento } from "@/lib/dati/documenti";
import { EtichettaPagamento, Etichetta } from "./Etichetta";
import { dataLunga, euro, nomeMese, numero } from "./formato";

type Props = {
  elenco: Elenco;
  mesi: { mese: string; n: number }[];
  meseAttivo: string | null;
  /** Parametri fissi degli URL (es. { scheda: "ddt" }). */
  base: Record<string, string>;
  percorso: string;
  href: (d: DocumentoElenco) => string;
  vuoto: ReactNode;
};

function url(percorso: string, base: Record<string, string>, extra: Record<string, string | undefined>): string {
  const p = new URLSearchParams(base);
  for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
  const s = p.toString();
  return `${percorso}${s ? `?${s}` : ""}`;
}

/** Elenco di DDT o fatture: filtro per mese (link, senza JavaScript), righe per data, paginazione. */
export function ElencoDocumenti({ elenco, mesi, meseAttivo, base, percorso, href, vuoto }: Props) {
  return (
    <>
      {mesi.length > 1 && (
        <nav aria-label="Filtra per mese" className="mt-5 -mx-4 overflow-x-auto px-4">
          <ul className="flex gap-2 pb-1">
            <li>
              <Chip href={url(percorso, base, {})} attivo={!meseAttivo}>
                Tutti
              </Chip>
            </li>
            {mesi.map((m) => (
              <li key={m.mese}>
                <Chip href={url(percorso, base, { mese: m.mese })} attivo={meseAttivo === m.mese}>
                  {nomeMese(m.mese)}
                </Chip>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {elenco.documenti.length === 0 ? (
        <div className="mt-6 rounded-lg border border-azzurro/40 bg-bianco px-6 py-10 text-center">{vuoto}</div>
      ) : (
        <ul className="mt-5 divide-y divide-azzurro/40 rounded-lg border border-azzurro/40 bg-bianco">
          {elenco.documenti.map((d) => (
            <li key={d.id}>
              <Link href={href(d)} className="flex items-center justify-between gap-4 px-4 py-4 hover:bg-ice">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {titoloDocumento(d)}
                    {!d.presente_in_nts && <span className="ml-2 text-xs font-normal text-slate">(non più in NTS)</span>}
                  </p>
                  <p className="text-sm text-slate">
                    {dataLunga(d.data_doc)}
                    {d.tipo === "ddt" && d.totale_colli ? ` · ${numero(d.totale_colli)} colli` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                  <p className="prezzo">{d.tipo === "nota_credito" ? `−${euro(Math.abs(d.totale))}` : euro(d.totale)}</p>
                  {d.tipo === "nota_credito" ? <Etichetta tono="tenue">Nota di credito</Etichetta> : <EtichettaPagamento stato={d.pagamento} />}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {elenco.pagine > 1 && (
        <nav aria-label="Pagine" className="mt-4 flex items-center justify-between gap-4 text-sm text-slate">
          <span>
            Pagina {elenco.pagina} di {elenco.pagine}
          </span>
          <div className="flex gap-2">
            <Pagina href={elenco.pagina > 1 ? url(percorso, base, { mese: meseAttivo ?? undefined, pagina: elenco.pagina > 2 ? String(elenco.pagina - 1) : undefined }) : null}>Più recenti</Pagina>
            <Pagina href={elenco.pagina < elenco.pagine ? url(percorso, base, { mese: meseAttivo ?? undefined, pagina: String(elenco.pagina + 1) }) : null}>Meno recenti</Pagina>
          </div>
        </nav>
      )}
    </>
  );
}

function Chip({ href, attivo, children }: { href: string; attivo: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={attivo ? "true" : undefined}
      className={`inline-flex min-h-9 items-center rounded-full border px-3.5 text-sm whitespace-nowrap first-letter:uppercase ${attivo ? "border-navy bg-navy font-semibold text-bianco" : "border-azzurro bg-bianco text-navy hover:bg-ice"}`}
    >
      {children}
    </Link>
  );
}

function Pagina({ href, children }: { href: string | null; children: ReactNode }) {
  if (!href) return <span className="rounded-md border border-azzurro/40 px-4 py-2 text-slate/60">{children}</span>;
  return (
    <Link href={href} className="rounded-md border border-navy px-4 py-2 font-semibold text-navy hover:bg-ice">
      {children}
    </Link>
  );
}
