import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Bottone, BottoneLink } from "@/components/Bottone";
import { FotoArticolo } from "@/components/catalogo/SchedaArticolo";
import { formattaPrezzo } from "@/lib/dati/catalogo";
import {
  carrelloBozza,
  clientePerCodice,
  domani,
  formattaData,
  GIORNI_SETTIMANA,
  prossimaConsegna,
  righeOrdine,
  type RigaOrdine,
} from "@/lib/dati/ordini";
import { leggiSessione } from "@/lib/sessione";
import { cambiaQuantita, conferma, rimuovi, salvaNotaRiga } from "../azioni";
import { Contenitore } from "@/components/Contenitore";
import { LogoFornitore } from "@/components/LogoFornitore";
import { IconaMeno, IconaPiu } from "@/components/Icone";
import { riepilogoSconti, testoSconto } from "@/lib/sconti";

export const metadata: Metadata = { title: "Carrello" };

type Props = { searchParams: Promise<{ errore?: string }> };

const campo = "rounded-md border border-azzurro bg-bianco px-3 py-2 text-sm";
const bottoneQta = "flex h-10 w-10 items-center justify-center rounded-md text-bianco transition-colors";

function RigaCarrello({ riga }: { riga: RigaOrdine }) {
  const articoloFinto = {
    cod_dav: riga.cod_dav, descrizione_nts: riga.descrizione, descrizione_pulita: riga.descrizione, um: riga.um, pezzi_confezione: null,
    prezzo_listino: null, foto_path: riga.foto_path, scheda_pdf_path: null, top80: false,
    famiglia: riga.famiglia ? { id: 0, nome: riga.famiglia } : null, fornitore: null, giacenza: null,
  };
  const prezzo = formattaPrezzo(riga.prezzo_finale);
  const sconto = testoSconto(riga);
  const subtotale = riga.prezzo_finale === null ? null : formattaPrezzo(riga.prezzo_finale * riga.quantita);
  return (
    <li className="flex gap-3 rounded-lg border border-azzurro/40 bg-bianco p-3 sm:gap-4 sm:p-4">
      <LogoFornitore nome={riga.marchio ?? ""} logo={riga.logo_marchio} formato="riga" />
      <Link href={`/catalogo/${encodeURIComponent(riga.cod_dav)}`} className="hidden shrink-0 sm:block">
        <FotoArticolo articolo={articoloFinto} formato="piccola" />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div>
          <p className="font-semibold leading-snug">{riga.descrizione}</p>
          <p className="text-xs text-slate">
            {riga.cod_dav}
            {riga.um ? ` · ${riga.um}` : ""}
            {prezzo ? ` · ${prezzo} cad.` : " · prezzo da definire"}
          </p>
          {sconto && (
            <p className="text-xs text-slate">
              Listino {formattaPrezzo(riga.prezzo_listino)} · <span className="font-semibold text-navy">sconto {sconto}</span>
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <form action={cambiaQuantita} className="flex items-center gap-2">
            <input type="hidden" name="riga" value={riga.id} />
            <input type="hidden" name="attuale" value={riga.quantita} />
            <button type="submit" name="azione" value="meno" className={`${bottoneQta} bg-rosso hover:bg-[#9a362e]`} aria-label="Una confezione in meno">
              <IconaMeno />
            </button>
            <label htmlFor={`qta-${riga.id}`} className="sr-only">
              Quantità
            </label>
            <input
              id={`qta-${riga.id}`}
              name="qta"
              type="number"
              min={0}
              step={1}
              defaultValue={riga.quantita}
              inputMode="numeric"
              className="h-10 w-16 rounded-md border border-azzurro bg-bianco text-center text-base"
            />
            <button type="submit" name="azione" value="piu" className={`${bottoneQta} bg-verde hover:bg-[#25714a]`} aria-label="Una confezione in più">
              <IconaPiu />
            </button>
            <button type="submit" name="azione" value="imposta" className="text-sm font-semibold underline underline-offset-2">
              Aggiorna
            </button>
          </form>
          {subtotale && <span className="prezzo ml-auto text-base">{subtotale}</span>}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <form action={salvaNotaRiga} className="flex flex-1 items-center gap-2">
            <input type="hidden" name="riga" value={riga.id} />
            <label htmlFor={`nota-${riga.id}`} className="sr-only">
              Nota per questa riga
            </label>
            <input
              id={`nota-${riga.id}`}
              name="note"
              type="text"
              defaultValue={riga.note ?? ""}
              placeholder="Nota per questa riga (es. taglio, scadenza)"
              maxLength={200}
              className={`${campo} flex-1`}
            />
            <button type="submit" className="text-sm font-semibold underline underline-offset-2">
              Salva
            </button>
          </form>
          <form action={rimuovi}>
            <input type="hidden" name="riga" value={riga.id} />
            <button type="submit" className="text-sm text-slate underline underline-offset-2">
              Rimuovi
            </button>
          </form>
        </div>
      </div>
    </li>
  );
}

async function Contenuto({ searchParams }: Props) {
  const s = await leggiSessione();
  if (!s || s.ruolo !== "cliente") redirect("/accedi");
  const [{ errore }, cliente] = await Promise.all([searchParams, clientePerCodice(s.codiceCliente)]);
  if (!cliente) redirect("/accedi");
  const bozza = await carrelloBozza(cliente.id, false);
  const righe = bozza ? await righeOrdine(bozza.id) : [];

  if (righe.length === 0) {
    return (
      <div className="mt-8 rounded-lg border border-azzurro/40 bg-bianco px-6 py-10 text-center">
        <p className="text-lg">Il carrello è vuoto.</p>
        <p className="mt-2 text-sm text-slate">Parti dai tuoi articoli abituali in home o cerca nel catalogo.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <BottoneLink href="/home">I tuoi articoli</BottoneLink>
          <BottoneLink href="/catalogo" variante="secondario">
            Catalogo
          </BottoneLink>
        </div>
      </div>
    );
  }

  const conPrezzo = righe.filter((r) => r.prezzo_finale !== null);
  const totale = conPrezzo.reduce((s, r) => s + (r.prezzo_finale ?? 0) * r.quantita, 0);
  const senzaPrezzo = righe.length - conPrezzo.length;
  const { listino, risparmio } = riepilogoSconti(righe);
  const giorniCliente = cliente.giorni_consegna;
  const dataDefault = prossimaConsegna(giorniCliente);

  return (
    <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_360px]">
      <ul className="space-y-3">
        {righe.map((r) => (
          <RigaCarrello key={r.id} riga={r} />
        ))}
      </ul>

      <form action={conferma} className="h-fit rounded-lg border border-azzurro/40 bg-bianco p-5 lg:sticky lg:top-24">
        <h2 className="text-2xl">Conferma ordine</h2>
        {errore && (
          <p role="alert" className="mt-3 rounded-md border border-navy bg-ice px-3 py-2 text-sm">
            {errore === "data" ? "Indica una data di consegna." : errore}
          </p>
        )}
        <div className="mt-4">
          <label htmlFor="data_consegna" className="etichetta block">
            Consegna richiesta
          </label>
          <input id="data_consegna" name="data_consegna" type="date" required min={domani()} defaultValue={dataDefault} className={`${campo} mt-2 w-full py-3 text-base`} />
          <p className="mt-1 text-xs text-slate">
            {giorniCliente.length
              ? `I tuoi giorni di consegna: ${giorniCliente.map((g) => GIORNI_SETTIMANA[g - 1]).join(", ")}.`
              : "Giorni di consegna non ancora registrati: proposto il primo giorno feriale utile."}
          </p>
        </div>
        <div className="mt-4">
          <label htmlFor="note" className="etichetta block">
            Note per l’ufficio
          </label>
          <textarea id="note" name="note" rows={3} maxLength={500} placeholder="Orario, riferimento, istruzioni di consegna…" className={`${campo} mt-2 w-full`} />
        </div>
        <dl className="mt-5 space-y-1 border-t border-azzurro/40 pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate">Righe</dt>
            <dd>{righe.length}</dd>
          </div>
          {risparmio >= 0.005 && (
            <>
              <div className="flex justify-between">
                <dt className="text-slate">Totale a listino</dt>
                <dd className="text-slate">{formattaPrezzo(listino)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate">Sconto sulle tue condizioni</dt>
                <dd className="font-semibold">−{formattaPrezzo(risparmio)}</dd>
              </div>
            </>
          )}
          <div className="flex justify-between">
            <dt className="text-slate">Totale netto, IVA esclusa</dt>
            <dd className="prezzo text-xl">{formattaPrezzo(totale)}</dd>
          </div>
          {senzaPrezzo > 0 && (
            <p className="text-xs text-slate">
              {senzaPrezzo} {senzaPrezzo === 1 ? "riga senza prezzo" : "righe senza prezzo"}: l’ufficio lo applica alla conferma.
            </p>
          )}
        </dl>
        <Bottone type="submit" className="mt-5 w-full">
          Conferma ordine
        </Bottone>
        <p className="mt-3 text-xs text-slate">
          L’ordine viene salvato e inviato all’ufficio DAV, che lo conferma. Consegna prevista {formattaData(dataDefault, { weekday: "long", day: "numeric", month: "long" })}.
        </p>
      </form>
    </div>
  );
}

export default function Carrello({ searchParams }: Props) {
  return (
    <Contenitore className="py-8">
      <p className="etichetta">Carrello</p>
      <h1 className="mt-1 text-3xl">Il tuo ordine</h1>
      <Suspense fallback={<p className="mt-6 text-sm text-slate">Carico il carrello…</p>}>
        <Contenuto searchParams={searchParams} />
      </Suspense>
    </Contenitore>
  );
}
