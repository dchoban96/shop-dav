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
import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoFornitore } from "@/components/LogoFornitore";
import { clientePerCodice, prezziCliente } from "@/lib/dati/ordini";
import { leggiSessione } from "@/lib/sessione";

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

  const s = await leggiSessione();
  if (!s || s.ruolo !== "cliente") redirect("/accedi");
  const [famiglie, marchi, soglia, cliente] = await Promise.all([leggiFamiglie(), leggiMarchi(), sogliaEsaurimento(), clientePerCodice(s.codiceCliente)]);
  if (!cliente) redirect("/accedi");
  // Un marchio tolto dal sito non filtra più: un vecchio link mostra tutto il catalogo.
  const marchioValido = marchi.some((m) => m.id === marchio) ? marchio : undefined;
  const ris = await cercaArticoli({ q, famiglia, marchio: marchioValido, ordina, pagina });
  // Il cliente vede solo il suo prezzo: una chiamata per tutta la pagina.
  const prezzi = await prezziCliente(cliente.id, ris.articoli.map((a) => a.cod_dav));

  const base = { q: q || undefined, famiglia: p.famiglia, marchio: marchioValido ? p.marchio : undefined, ordina: ordina !== "nome" ? ordina : undefined };
  const marchioSel = marchi.find((m) => m.id === marchioValido);
  const nomeMarchioSel = marchioSel ? marchioSel.nome_breve || marchioSel.nome_nts : null;
  const titolo = famiglie.find((f) => f.id === famiglia)?.nome ?? nomeMarchioSel ?? (q ? `Risultati per “${q}”` : "Tutti gli articoli");

  return (
    <>
      <FiltriCatalogo q={q} famiglia={famiglia} marchio={marchioValido} ordina={ordina} famiglie={famiglie} marchi={marchi} />
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {marchioSel && nomeMarchioSel && <LogoFornitore nome={nomeMarchioSel} logo={marchioSel.logo_path} formato="riga" />}
          <div>
            {marchioSel && (
              <p className="text-xs text-slate">
                <Link href="/marchi" className="hover:underline">
                  Tutti i marchi
                </Link>{" "}
                / {nomeMarchioSel}
              </p>
            )}
            <h2 className="text-2xl">{titolo}</h2>
          </div>
        </div>
        <p className="text-sm text-slate">
          {ris.totale} {ris.totale === 1 ? "articolo" : "articoli"}
        </p>
      </div>
      {ris.articoli.length === 0 ? (
        <p className="mt-6 rounded-lg border border-azzurro/40 bg-bianco px-4 py-6 text-center text-sm text-slate">
          Nessun articolo trovato. Prova con meno parole o togli un filtro.
        </p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {ris.articoli.map((a) => (
            <li key={a.cod_dav}>
              <SchedaArticolo articolo={a} stato={disponibilita(a.giacenza, soglia)} prezzo={prezzi.get(a.cod_dav)?.prezzo_finale ?? null} />
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
