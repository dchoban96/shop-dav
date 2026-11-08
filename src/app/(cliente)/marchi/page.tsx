import type { Metadata } from "next";
import { Suspense } from "react";
import { Contenitore } from "@/components/Contenitore";
import { ScaffaleMarchi, tileMarchio } from "@/components/ScaffaleMarchi";
import { fotoPerMarchio, leggiMarchi } from "@/lib/dati/catalogo";

export const metadata: Metadata = { title: "Marchi" };

type Props = { searchParams: Promise<{ q?: string }> };

/** Tutti i marchi a catalogo, filtrabili per nome; ogni card porta al catalogo filtrato. */
async function Elenco({ searchParams }: Props) {
  const [{ q = "" }, marchi, foto] = await Promise.all([searchParams, leggiMarchi(), fotoPerMarchio()]);
  const testo = q.trim().toLowerCase();
  const filtrati = testo ? marchi.filter((m) => `${m.nome_breve ?? ""} ${m.nome_nts}`.toLowerCase().includes(testo)) : marchi;

  return (
    <>
      <p className="mt-1 text-sm text-slate">
        {marchi.length} marchi a catalogo{testo ? `, ${filtrati.length} ${filtrati.length === 1 ? "trovato" : "trovati"} per “${q.trim()}”` : ""}.
      </p>
      <form method="get" action="/marchi" className="mt-6 flex max-w-md gap-2">
        <label htmlFor="q" className="sr-only">
          Filtra i marchi
        </label>
        <input id="q" name="q" type="search" defaultValue={q} placeholder="Filtra i marchi…" className="h-11 w-full rounded-md border border-azzurro bg-bianco px-4 text-base" />
        <button type="submit" className="h-11 shrink-0 rounded-md bg-navy px-5 text-sm font-semibold text-bianco hover:bg-[#0d2144]">
          Filtra
        </button>
      </form>
      {filtrati.length === 0 ? (
        <p className="mt-6 rounded-lg border border-azzurro/40 bg-bianco px-4 py-6 text-center text-sm text-slate">Nessun marchio con questo nome.</p>
      ) : (
        <ScaffaleMarchi marchi={filtrati.map((m) => tileMarchio(m, foto))} className="mt-6" />
      )}
    </>
  );
}

export default function Marchi({ searchParams }: Props) {
  return (
    <Contenitore className="py-8">
      <p className="etichetta">Catalogo</p>
      <h1 className="mt-1 text-3xl">Marchi</h1>
      <Suspense fallback={<p className="mt-6 text-sm text-slate">Carico i marchi…</p>}>
        <Elenco searchParams={searchParams} />
      </Suspense>
    </Contenitore>
  );
}
