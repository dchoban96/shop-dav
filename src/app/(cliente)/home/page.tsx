import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Bottone } from "@/components/Bottone";
import { FotoArticolo } from "@/components/catalogo/SchedaArticolo";
import { formattaPrezzo, fotoPerMarchio, leggiFamiglie, leggiMarchi } from "@/lib/dati/catalogo";
import { clientePerCodice, formattaData, storicoCliente } from "@/lib/dati/ordini";
import { leggiSessione } from "@/lib/sessione";
import { aggiungiDaStorico } from "../azioni";
import { Contenitore } from "@/components/Contenitore";
import { LogoFornitore } from "@/components/LogoFornitore";
import { ScaffaleMarchi, tileMarchio } from "@/components/ScaffaleMarchi";

export const metadata: Metadata = { title: "Home" };

/** Home del cliente (STRUTTURA, sezione 1): quattro sezioni in quest'ordine. */

async function SezioneTuoiArticoli() {
  const s = await leggiSessione();
  if (!s || s.ruolo !== "cliente") redirect("/accedi");
  const cliente = await clientePerCodice(s.codiceCliente);
  if (!cliente) redirect("/accedi");
  const voci = await storicoCliente(cliente.id);

  return (
    <section className="rounded-lg border border-azzurro/40 bg-bianco p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-2xl">I tuoi articoli</h2>
        <p className="text-sm text-slate">Quantità dell’ultimo ordine già impostate.</p>
      </div>
      {voci.length === 0 ? (
        <p className="mt-4 rounded-md bg-ice px-4 py-3 text-sm text-slate">
          Qui compariranno gli articoli che ordini di solito. Dopo il primo ordine, o con lo storico vendite, la lista si riempie da sola.
        </p>
      ) : (
        <form action={aggiungiDaStorico} className="mt-4">
          <ul className="divide-y divide-ice">
            {voci.map((v) => {
              const articoloFinto = {
                cod_dav: v.cod_dav, descrizione_nts: v.descrizione, descrizione_pulita: v.descrizione, um: v.um, pezzi_confezione: null,
                prezzo_listino: null, foto_path: v.foto_path, scheda_pdf_path: null, top80: false,
                famiglia: v.famiglia ? { id: 0, nome: v.famiglia } : null, fornitore: null, giacenza: null,
              };
              return (
                <li key={v.cod_dav} className="flex items-center gap-3 py-3">
                  <LogoFornitore nome={v.marchio ?? "Marchio"} logo={v.logo_marchio} formato="riga" />
                  <span className="hidden sm:block">
                    <FotoArticolo articolo={articoloFinto} formato="piccola" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/catalogo/${encodeURIComponent(v.cod_dav)}`} className="block truncate font-semibold hover:underline">
                      {v.descrizione}
                    </Link>
                    <p className="text-xs text-slate">
                      ultimo acquisto {formattaData(v.ultima_data, { month: "2-digit", year: "numeric" })} · 12 mesi: {v.n_ordini_12m}{" "}
                      {v.n_ordini_12m === 1 ? "ordine" : "ordini"}, {v.qta_12m} {v.um ?? "conf."}
                      {v.fatturato_12m > 0 ? `, ${formattaPrezzo(v.fatturato_12m)}` : ""}
                    </p>
                  </div>
                  <label htmlFor={`qta-${v.cod_dav}`} className="sr-only">
                    Quantità {v.descrizione}
                  </label>
                  <input
                    id={`qta-${v.cod_dav}`}
                    name={`qta:${v.cod_dav}`}
                    type="number"
                    min={0}
                    step={1}
                    defaultValue={v.ultima_quantita ?? 1}
                    inputMode="numeric"
                    className="h-10 w-16 rounded-md border border-azzurro bg-bianco text-center text-base"
                  />
                  <button
                    type="submit"
                    name="solo"
                    value={v.cod_dav}
                    className="flex h-10 w-10 items-center justify-center rounded-md border border-navy text-lg font-semibold text-navy hover:bg-ice"
                    aria-label={`Aggiungi ${v.descrizione} al carrello`}
                  >
                    +
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex justify-end">
            <Bottone type="submit" name="tutto" value="1">
              Aggiungi tutto al carrello
            </Bottone>
          </div>
        </form>
      )}
    </section>
  );
}

const sezioniInArrivo = [
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
  const [famiglie, marchi, foto] = await Promise.all([leggiFamiglie(), leggiMarchi(), fotoPerMarchio()]);
  const totale = famiglie.reduce((s, f) => s + f.n_articoli, 0);
  // Scaffale: i primi 8 marchi per numero di articoli come card (logo o foto di ripiego), poi i chip.
  const inScaffale = marchi.slice(0, 8);
  const tile = inScaffale.map((m) => tileMarchio(m, foto));
  const altri = marchi.slice(8, 24);
  const restanti = marchi.length - tile.length - altri.length;
  return (
    <section className="rounded-lg border border-azzurro/40 bg-bianco p-6">
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
            <Link href={`/catalogo?famiglia=${f.id}`} className="inline-block rounded-md bg-ice px-3 py-1.5 text-sm text-navy hover:bg-azzurro/40">
              {f.nome} <span className="text-slate">{f.n_articoli}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="etichetta mt-6">Per marchio</p>
      {tile.length > 0 && <ScaffaleMarchi marchi={tile} className="mt-2" />}
      <ul className="mt-3 flex flex-wrap gap-2">
        {altri.map((m) => (
          <li key={m.id}>
            <Link href={`/catalogo?marchio=${m.id}`} className="inline-block rounded-md border border-azzurro/40 px-3 py-1.5 text-sm text-navy hover:bg-ice">
              {m.nome_breve ?? m.nome_nts} <span className="text-slate">{m.n_articoli}</span>
            </Link>
          </li>
        ))}
        {restanti > 0 && (
          <li>
            <Link href="/marchi" className="inline-block px-3 py-1.5 text-sm font-semibold underline underline-offset-4">
              Tutti i {marchi.length} marchi
            </Link>
          </li>
        )}
      </ul>
    </section>
  );
}

export default function HomeCliente() {
  return (
    <Contenitore className="py-8">
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Suspense fallback={<p className="text-sm text-slate">Carico i tuoi articoli…</p>}>
            <SezioneTuoiArticoli />
          </Suspense>
          {sezioniInArrivo.map((s) => (
            <section key={s.titolo} className="rounded-lg border border-azzurro/40 bg-bianco p-6">
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
          <div className="sticky top-24 rounded-lg border border-azzurro/40 bg-bianco p-5">
            <p className="etichetta">I tuoi acquisti</p>
            <h2 className="mt-1 text-xl">Ultimi 12 mesi</h2>
            <p className="mt-4 text-sm text-slate">Qui compariranno fatturato, ripartizione per marchio o famiglia, ultimo ordine e statistiche per articolo.</p>
          </div>
        </aside>
      </div>
    </Contenitore>
  );
}
