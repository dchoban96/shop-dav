import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { BadgeDisponibilita, FotoArticolo, Prezzo } from "@/components/catalogo/SchedaArticolo";
import { Bottone } from "@/components/Bottone";
import { disponibilita, leggiArticolo, nomeMarchio, sogliaEsaurimento } from "@/lib/dati/catalogo";
import { aggiungi } from "../../azioni";
import { Contenitore } from "@/components/Contenitore";
import { LogoFornitore } from "@/components/LogoFornitore";
import { IconaCarrello } from "@/components/Icone";
import { clientePerCodice, MESSAGGIO_SCONTISTICA, prezzoCliente, SCONTO_DA_VERIFICARE } from "@/lib/dati/ordini";
import { leggiSessione } from "@/lib/sessione";

export const metadata: Metadata = { title: "Articolo" };

type Props = { params: Promise<{ cod_dav: string }> };

async function Dettaglio({ params }: Props) {
  const { cod_dav } = await params;
  const s = await leggiSessione();
  if (!s || s.ruolo !== "cliente") redirect("/accedi");
  const [articolo, soglia, cliente] = await Promise.all([
    leggiArticolo(decodeURIComponent(cod_dav)),
    sogliaEsaurimento(),
    clientePerCodice(s.codiceCliente),
  ]);
  if (!articolo) notFound();
  if (!cliente) redirect("/accedi");
  // Il cliente vede solo il suo prezzo (accordato, scontato o listino, nell'ordine).
  const prezzo = await prezzoCliente(cliente.id, articolo.cod_dav);
  const nome = articolo.descrizione_pulita ?? articolo.descrizione_nts;
  const stato = disponibilita(articolo.giacenza, soglia);

  return (
    <div className="grid gap-8 rounded-lg border border-azzurro/40 bg-bianco p-5 md:grid-cols-[minmax(0,360px)_1fr] md:p-8">
      <FotoArticolo articolo={articolo} grande />
      <div className="flex flex-col gap-4">
        <div>
          {articolo.fornitore && (
            <div className="mb-3 flex items-center gap-3">
              <LogoFornitore nome={nomeMarchio(articolo)} logo={articolo.fornitore.logo_path} formato="riga" />
              <p className="etichetta">{nomeMarchio(articolo)}</p>
            </div>
          )}
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
          <Prezzo valore={prezzo?.prezzo_finale ?? null} className="text-2xl" />
          <span className="text-xs text-slate">Prezzo riservato, IVA esclusa</span>
        </div>
        {prezzo?.origine === SCONTO_DA_VERIFICARE && <p className="text-sm text-slate">{MESSAGGIO_SCONTISTICA}</p>}

        <form className="flex items-center gap-3" action={aggiungi}>
          <input type="hidden" name="cod_dav" value={articolo.cod_dav} />
          <input type="hidden" name="torna" value="/carrello" />
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
          <Bottone type="submit" variante="carrello" className="flex-1">
            <IconaCarrello />
            Aggiungi al carrello
          </Bottone>
        </form>

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
    <Contenitore className="py-8">
      <p className="mb-6 text-sm">
        <Link href="/catalogo" className="underline underline-offset-2">
          ← Catalogo
        </Link>
      </p>
      <Suspense fallback={<p className="text-sm text-slate">Carico l’articolo…</p>}>
        <Dettaglio params={params} />
      </Suspense>
    </Contenitore>
  );
}
