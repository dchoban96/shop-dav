import type { Metadata } from "next";
import { Suspense } from "react";
import { FiltriCatalogo } from "@/components/catalogo/FiltriCatalogo";
import { Paginazione } from "@/components/catalogo/Paginazione";
import { SchedaArticolo } from "@/components/catalogo/SchedaArticolo";
import {
  cercaArticoli,
  disponibilita,
  leggiFamiglie,
  leggiMarchi,
  sogliaEsaurimento,
  type Ordinamento,
} from "@/lib/dati/catalogo";
import { Contenitore } from "@/components/Contenitore";

export const metadata: Metadata = { title: "Catalogo" };

type Params = { q?: string; famiglia?: string; marchio?: string; ordina?: string; pagina?: string };
type Props = { searchParams: Promise<Params> };

function intero(v: string | undefined): number | undefined {
  const n = Number(v);
  return v && Number.isInteger(n) && n > 0 ? n : undefined;
}

async function Risultati({ searchParams }: Props) {
  const p = await searchParams;
  const q = (p.q ?? "").trim();
  const famiglia = intero(p.famiglia);
  const marchio = intero(p.marchio);
  const ordina: Ordinamento = p.ordina === "vendite" || p.ordina === "codice" ? p.ordina : "nome";
  const pagina = intero(p.pagina) ?? 1;

  const [ris, famiglie, marchi, soglia] = await Promise.all([
    cercaArticoli({ q, famiglia, marchio, ordina, pagina }),
    leggiFamiglie(),
    leggiMarchi(),
    sogliaEsaurimento(),
  ]);

  const base = { q: q || undefined, famiglia: p.famiglia, marchio: p.marchio, ordina: ordina !== "nome" ? ordina : undefined };
  const titolo =
    famiglie.find((f) => f.id === famiglia)?.nome ??
    (marchi.find((m) => m.id === marchio)?.nome_breve || marchi.find((m) => m.id === marchio)?.nome_nts) ??
    (q ? `Risultati per “${q}”` : "Tutti gli articoli");

  return (
    <>
      <FiltriCatalogo q={q} famiglia={famiglia} marchio={marchio} ordina={ordina} famiglie={famiglie} marchi={marchi} />
      <div className="mt-8 flex items-baseline justify-between gap-4">
        <h2 className="text-2xl">{titolo}</h2>
      </div>
      {ris.articoli.length === 0 ? (
        <p className="mt-6 rounded-md bg-ice px-4 py-6 text-center text-sm text-slate">
          Nessun articolo trovato. Prova con meno parole o togli un filtro.
        </p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {ris.articoli.map((a) => (
            <li key={a.cod_dav}>
              <SchedaArticolo articolo={a} stato={disponibilita(a.giacenza, soglia)} />
            </li>
          ))}
        </ul>
      )}
      <div className="mt-8">
        <Paginazione pagina={ris.pagina} pagine={ris.pagine} totale={ris.totale} base={base} />
      </div>
    </>
  );
}

export default function Catalogo({ searchParams }: Props) {
  return (
    <Contenitore className="py-8">
      <p className="etichetta">Catalogo</p>
      <h1 className="mt-1 text-3xl">Tutti i prodotti DAV</h1>
      <div className="mt-6">
        <Suspense fallback={<p className="text-sm text-slate">Carico il catalogo…</p>}>
          <Risultati searchParams={searchParams} />
        </Suspense>
      </div>
    </Contenitore>
  );
}
