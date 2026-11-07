import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { BadgeStato } from "@/components/admin/StatoOrdine";
import { formattaPrezzo } from "@/lib/dati/catalogo";
import { ordineAdmin } from "@/lib/dati/admin";
import { ETICHETTA_STATO, formattaData, type StatoOrdine } from "@/lib/dati/ordini";
import { aggiornaStato } from "../../azioni";

export const metadata = { title: "Ordine" };

type Props = { params: Promise<{ id: string }> };

/** Passaggi di stato proposti all'ufficio, nell'ordine del lavoro. */
const PROSSIMI: Record<StatoOrdine, StatoOrdine[]> = {
  bozza: [],
  inviato: ["confermato", "inserito_nts", "annullato"],
  confermato: ["inserito_nts", "annullato"],
  inserito_nts: ["consegnato", "annullato"],
  consegnato: [],
  annullato: ["inviato"],
};

const sconto = (s1: number, s2: number) => [s1, s2].filter((s) => s > 0).map((s) => `${s.toLocaleString("it-IT")}%`).join(" + ") || "—";

async function Dettaglio({ params }: Props) {
  const { id } = await params;
  const dati = Number.isInteger(Number(id)) ? await ordineAdmin(Number(id)) : null;
  if (!dati) notFound();
  const { ordine, righe } = dati;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl">Ordine n. {ordine.numero}</h1>
          <p className="mt-1 text-sm text-slate">
            Inviato il {formattaData(ordine.creato_il, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <BadgeStato stato={ordine.stato} />
      </div>

      <dl className="mt-6 grid gap-x-8 gap-y-2 rounded-lg bg-ice p-4 text-sm sm:grid-cols-[180px_1fr]">
        <dt className="text-slate">Cliente</dt>
        <dd>
          <Link href={`/admin/clienti/${ordine.cliente?.id}`} className="font-semibold underline underline-offset-2">
            {ordine.cliente?.ragione_sociale}
          </Link>{" "}
          · codice {ordine.cliente?.codice_nts}
          {ordine.cliente?.demo ? " · cliente demo" : ""}
        </dd>
        <dt className="text-slate">Consegna richiesta</dt>
        <dd className="font-semibold">{formattaData(ordine.data_consegna_richiesta, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</dd>
        <dt className="text-slate">Note ordine</dt>
        <dd>{ordine.note ?? "—"}</dd>
        <dt className="text-slate">Email</dt>
        <dd>{ordine.email_inviata_il ? `inviata il ${formattaData(ordine.email_inviata_il, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : "non inviata"}</dd>
      </dl>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left">
            <tr className="border-b border-azzurro/40">
              <th className="etichetta py-2 pr-2">Codice</th>
              <th className="etichetta py-2 pr-2">Articolo</th>
              <th className="etichetta py-2 text-right">Q.tà</th>
              <th className="etichetta py-2 pl-2">UM</th>
              <th className="etichetta py-2 text-right">Listino</th>
              <th className="etichetta py-2 text-right">Sconti</th>
              <th className="etichetta py-2 text-right">Prezzo</th>
              <th className="etichetta py-2 text-right">Importo</th>
            </tr>
          </thead>
          <tbody>
            {righe.map((r) => (
              <tr key={r.id} className="border-b border-ice align-top">
                <td className="py-2 pr-2 font-mono text-xs">{r.cod_dav}</td>
                <td className="py-2 pr-2">
                  {r.descrizione}
                  {r.note && <p className="text-xs text-slate">Nota: {r.note}</p>}
                </td>
                <td className="py-2 text-right font-semibold">{r.quantita}</td>
                <td className="py-2 pl-2">{r.um ?? "—"}</td>
                <td className="py-2 text-right">{formattaPrezzo(r.prezzo_listino) ?? "—"}</td>
                <td className="py-2 text-right">{r.prezzo_accordato !== null ? "accordato" : sconto(r.sconto1, r.sconto2)}</td>
                <td className="py-2 text-right">{formattaPrezzo(r.prezzo_finale) ?? "da definire"}</td>
                <td className="py-2 text-right">{r.prezzo_finale === null ? "—" : formattaPrezzo(r.prezzo_finale * r.quantita)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={7} className="py-3 text-right text-slate">
                Totale netto, IVA esclusa
              </td>
              <td className="prezzo py-3 text-right text-xl">{formattaPrezzo(ordine.totale_netto)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <section className="mt-8 rounded-lg border border-azzurro/40 p-5">
        <h2 className="text-xl">Stato</h2>
        {PROSSIMI[ordine.stato].length === 0 ? (
          <p className="mt-2 text-sm text-slate">Nessun passaggio successivo.</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-3">
            {PROSSIMI[ordine.stato].map((s) => (
              <form key={s} action={aggiornaStato}>
                <input type="hidden" name="ordine" value={ordine.id} />
                <input type="hidden" name="stato" value={s} />
                <button
                  type="submit"
                  className={
                    s === "annullato"
                      ? "rounded-md border border-azzurro px-4 py-2.5 text-sm font-semibold text-slate hover:bg-ice"
                      : "rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-bianco hover:bg-[#0d2144]"
                  }
                >
                  {s === "inserito_nts" ? "Segna inserito in NTS" : s === "inviato" ? "Ripristina" : `Segna ${ETICHETTA_STATO[s].toLowerCase()}`}
                </button>
              </form>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-slate">Il cliente vede lo stato aggiornato nella sua pagina ordini.</p>
      </section>
    </>
  );
}

export default function OrdineAdminPagina({ params }: Props) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <p className="mb-4 text-sm">
        <Link href="/admin/ordini" className="underline underline-offset-2">
          ← Ordini
        </Link>
      </p>
      <Suspense fallback={<p className="text-sm text-slate">Carico l’ordine…</p>}>
        <Dettaglio params={params} />
      </Suspense>
    </div>
  );
}
