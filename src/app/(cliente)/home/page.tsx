import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { leggiFamiglie, leggiMarchi } from "@/lib/dati/catalogo";

export const metadata: Metadata = { title: "Home" };

/**
 * Home del cliente (STRUTTURA, sezione 1): quattro sezioni in quest'ordine.
 * Le prime tre dipendono dallo storico vendite (import NTS); la quarta è viva.
 */
const sezioniInArrivo = [
  {
    titolo: "I tuoi articoli",
    testo: "Gli articoli che ordini di solito, con le quantità dell’ultimo ordine già pronte.",
    nota: "In arrivo con lo storico vendite.",
  },
  {
    titolo: "Consigliati per te",
    testo: "Articoli che ordinavi e non prendi da un po’, e i più richiesti nella tua categoria.",
    nota: "In arrivo con lo storico vendite.",
  },
  {
    titolo: "In evidenza",
    testo: "Le proposte dell’ufficio DAV di questo periodo.",
    nota: "Nessuna proposta attiva al momento.",
  },
];

async function SezioneCatalogo() {
  const [famiglie, marchi] = await Promise.all([leggiFamiglie(), leggiMarchi()]);
  const totale = famiglie.reduce((s, f) => s + f.n_articoli, 0);
  return (
    <section className="rounded-lg border border-azzurro/40 p-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-2xl">Catalogo</h2>
        <Link href="/catalogo" className="text-sm font-semibold underline underline-offset-4">
          Tutti i {totale} articoli
        </Link>
      </div>

      <p className="etichetta mt-6">Per famiglia</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {famiglie.map((f) => (
          <li key={f.id}>
            <Link
              href={`/catalogo?famiglia=${f.id}`}
              className="inline-block rounded-md bg-ice px-3 py-1.5 text-sm text-navy hover:bg-azzurro/40"
            >
              {f.nome} <span className="text-slate">{f.n_articoli}</span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="etichetta mt-6">Per marchio</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {marchi.slice(0, 24).map((m) => (
          <li key={m.id}>
            <Link
              href={`/catalogo?marchio=${m.id}`}
              className="inline-block rounded-md border border-azzurro/40 px-3 py-1.5 text-sm text-navy hover:bg-ice"
            >
              {m.nome_breve ?? m.nome_nts} <span className="text-slate">{m.n_articoli}</span>
            </Link>
          </li>
        ))}
        {marchi.length > 24 && (
          <li>
            <Link href="/catalogo" className="inline-block px-3 py-1.5 text-sm font-semibold underline underline-offset-4">
              e altri {marchi.length - 24} marchi
            </Link>
          </li>
        )}
      </ul>
    </section>
  );
}

export default function HomeCliente() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <form method="get" action="/catalogo" role="search">
        <label htmlFor="ricerca" className="sr-only">
          Cerca un articolo
        </label>
        <input
          id="ricerca"
          name="q"
          type="search"
          placeholder="Cerca per nome o codice"
          className="w-full rounded-md border border-azzurro bg-bianco px-4 py-3 text-base"
        />
      </form>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {sezioniInArrivo.map((s) => (
            <section key={s.titolo} className="rounded-lg border border-azzurro/40 p-6">
              <h2 className="text-2xl">{s.titolo}</h2>
              <p className="mt-2 text-sm text-slate">{s.testo}</p>
              <p className="mt-4 rounded-md bg-ice px-4 py-3 text-sm text-slate">{s.nota}</p>
            </section>
          ))}
          <Suspense fallback={<p className="text-sm text-slate">Carico il catalogo…</p>}>
            <SezioneCatalogo />
          </Suspense>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-24 rounded-lg border border-azzurro/40 p-5">
            <p className="etichetta">I tuoi acquisti</p>
            <h2 className="mt-1 text-xl">Ultimi 12 mesi</h2>
            <p className="mt-4 text-sm text-slate">
              Qui compariranno fatturato, ripartizione per marchio o famiglia, ultimo ordine e statistiche per
              articolo.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
