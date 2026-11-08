import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { Bottone } from "@/components/Bottone";
import { formattaPrezzo } from "@/lib/dati/catalogo";
import { clientePerCodice, ETICHETTA_STATO, formattaData, ordinePerId } from "@/lib/dati/ordini";
import { leggiSessione } from "@/lib/sessione";
import { riordina } from "../../azioni";
import { Contenitore } from "@/components/Contenitore";
import { LogoFornitore } from "@/components/LogoFornitore";

export const metadata: Metadata = { title: "Ordine" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ confermato?: string }> };

async function Dettaglio({ params, searchParams }: Props) {
  const s = await leggiSessione();
  if (!s || s.ruolo !== "cliente") redirect("/accedi");
  const [{ id }, { confermato }, cliente] = await Promise.all([params, searchParams, clientePerCodice(s.codiceCliente)]);
  if (!cliente) redirect("/accedi");
  const dettaglio = Number.isInteger(Number(id)) ? await ordinePerId(cliente.id, Number(id)) : null;
  if (!dettaglio) notFound();
  const { ordine, righe } = dettaglio;

  return (
    <>
      {confermato && (
        <div role="status" className="mt-6 rounded-lg bg-navy px-5 py-4 text-bianco">
          <p className="font-serif text-xl">Ordine inviato, grazie.</p>
          <p className="mt-1 text-sm">
            L’ufficio DAV lo conferma a breve.{" "}
            {ordine.email_inviata_il ? "Copia inviata via email." : "Email non inviata: invio in configurazione, l’ordine è comunque registrato."}
          </p>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl">Ordine n. {ordine.numero}</h1>
          <p className="mt-1 text-sm text-slate">
            Inviato il {formattaData(ordine.creato_il, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <span className="rounded-md border border-azzurro/40 bg-bianco px-3 py-1.5 text-sm font-semibold">{ETICHETTA_STATO[ordine.stato]}</span>
      </div>

      <dl className="mt-6 grid gap-x-8 gap-y-2 rounded-lg border border-azzurro/40 bg-bianco p-4 text-sm sm:grid-cols-2">
        <dt className="text-slate">Consegna richiesta</dt>
        <dd>{formattaData(ordine.data_consegna_richiesta, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</dd>
        <dt className="text-slate">Note</dt>
        <dd>{ordine.note ?? "—"}</dd>
      </dl>

      <div className="mt-6 overflow-x-auto rounded-lg border border-azzurro/40 bg-bianco p-4">
      <table className="w-full text-sm">
        <thead className="text-left">
          <tr className="border-b border-azzurro/40">
            <th className="etichetta py-2 font-semibold">Articolo</th>
            <th className="etichetta py-2 text-right font-semibold">Q.tà</th>
            <th className="etichetta hidden py-2 text-right font-semibold sm:table-cell">Prezzo</th>
            <th className="etichetta py-2 text-right font-semibold">Importo</th>
          </tr>
        </thead>
        <tbody>
          {righe.map((r) => (
            <tr key={r.id} className="border-b border-ice align-top">
              <td className="py-2 pr-2">
                <div className="flex items-start gap-3">
                  <LogoFornitore nome={r.marchio ?? "Marchio"} logo={r.logo_marchio} formato="compatto" />
                  <div className="min-w-0">
                    <Link href={`/catalogo/${encodeURIComponent(r.cod_dav)}`} className="font-semibold hover:underline">
                      {r.descrizione}
                    </Link>
                    <p className="text-xs text-slate">
                      {r.cod_dav}
                      {r.um ? ` · ${r.um}` : ""}
                      {r.note ? ` · ${r.note}` : ""}
                    </p>
                  </div>
                </div>
              </td>
              <td className="py-2 text-right">{r.quantita}</td>
              <td className="hidden py-2 text-right sm:table-cell">{formattaPrezzo(r.prezzo_finale) ?? "da definire"}</td>
              <td className="py-2 text-right">{r.prezzo_finale === null ? "—" : formattaPrezzo(r.prezzo_finale * r.quantita)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} className="py-3 text-right text-slate">
              Totale netto, IVA esclusa
            </td>
            <td className="prezzo py-3 text-right text-xl">{formattaPrezzo(ordine.totale_netto)}</td>
          </tr>
        </tfoot>
      </table>
      </div>

      <form action={riordina} className="mt-8">
        <input type="hidden" name="ordine" value={ordine.id} />
        <Bottone type="submit">Riordina questo</Bottone>
        <p className="mt-2 text-xs text-slate">Le stesse righe e quantità finiscono nel carrello; poi le modifichi e confermi.</p>
      </form>
    </>
  );
}

export default function PaginaOrdine(props: Props) {
  return (
    <Contenitore className="py-8">
      <p className="text-sm">
        <Link href="/ordini" className="underline underline-offset-2">
          ← I tuoi ordini
        </Link>
      </p>
      <Suspense fallback={<p className="mt-6 text-sm text-slate">Carico l’ordine…</p>}>
        <Dettaglio {...props} />
      </Suspense>
    </Contenitore>
  );
}
