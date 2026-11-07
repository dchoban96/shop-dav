import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BadgeDisponibilita, FotoArticolo, Prezzo } from "@/components/catalogo/SchedaArticolo";
import { Bottone } from "@/components/Bottone";
import { disponibilita, leggiArticolo, nomeMarchio, sogliaEsaurimento } from "@/lib/dati/catalogo";

export const metadata: Metadata = { title: "Articolo" };

type Props = { params: Promise<{ cod_dav: string }> };

async function Dettaglio({ params }: Props) {
  const { cod_dav } = await params;
  const [articolo, soglia] = await Promise.all([leggiArticolo(decodeURIComponent(cod_dav)), sogliaEsaurimento()]);
  if (!articolo) notFound();
  const nome = articolo.descrizione_pulita ?? articolo.descrizione_nts;
  const stato = disponibilita(articolo.giacenza, soglia);

  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,360px)_1fr]">
      <FotoArticolo articolo={articolo} grande />
      <div className="flex flex-col gap-4">
        <div>
          <p className="etichetta">{nomeMarchio(articolo)}</p>
          <h1 className="mt-1 text-3xl leading-tight">{nome}</h1>
          <p className="mt-2 text-sm text-slate">
            Codice {articolo.cod_dav}
            {articolo.famiglia ? (
              <>
                {" · "}
                <Link href={`/catalogo?famiglia=${articolo.famiglia.id}`} className="underline underline-offset-2">
                  {articolo.famiglia.nome}
                </Link>
              </>
            ) : null}
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg bg-ice p-4 text-sm">
          <dt className="text-slate">Unità di misura</dt>
          <dd>{articolo.um ?? "da definire"}</dd>
          <dt className="text-slate">Pezzi per confezione</dt>
          <dd>{articolo.pezzi_confezione ?? "da definire"}</dd>
          <dt className="text-slate">Disponibilità</dt>
          <dd>
            <BadgeDisponibilita stato={stato} />
          </dd>
          {articolo.scheda_pdf_path && (
            <>
              <dt className="text-slate">Scheda tecnica</dt>
              <dd>
                <a href={articolo.scheda_pdf_path} className="underline underline-offset-2" target="_blank" rel="noopener">
                  Apri PDF
                </a>
              </dd>
            </>
          )}
        </dl>

        <div className="flex items-center justify-between gap-4 border-t border-azzurro/40 pt-4">
          <Prezzo valore={articolo.prezzo_listino} className="text-2xl" />
          <span className="text-xs text-slate">Prezzo riservato, IVA esclusa</span>
        </div>

        <form className="flex items-center gap-3" action="#">
          <label htmlFor="qta" className="etichetta">
            Quantità
          </label>
          <input
            id="qta"
            name="qta"
            type="number"
            min={1}
            step={1}
            defaultValue={1}
            inputMode="numeric"
            className="w-24 rounded-md border border-azzurro bg-bianco px-3 py-3 text-center text-base"
          />
          <Bottone type="submit" disabled className="flex-1">
            Aggiungi al carrello
          </Bottone>
        </form>
        <p className="text-xs text-slate">Il carrello arriva nel prossimo passo.</p>

        <details className="text-sm text-slate">
          <summary className="cursor-pointer font-semibold text-navy">Descrizione completa del gestionale</summary>
          <p className="mt-2">{articolo.descrizione_nts}</p>
        </details>
      </div>
    </div>
  );
}

export default function PaginaArticolo({ params }: Props) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <p className="mb-6 text-sm">
        <Link href="/catalogo" className="underline underline-offset-2">
          ← Catalogo
        </Link>
      </p>
      <Suspense fallback={<p className="text-sm text-slate">Carico l’articolo…</p>}>
        <Dettaglio params={params} />
      </Suspense>
    </div>
  );
}
