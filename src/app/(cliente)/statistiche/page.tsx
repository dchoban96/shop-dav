import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Contenitore } from "@/components/Contenitore";
import { formattaPrezzo } from "@/lib/dati/catalogo";
import { clientePerCodice, formattaData, riepilogo12m } from "@/lib/dati/ordini";
import { leggiSessione } from "@/lib/sessione";

export const metadata: Metadata = { title: "Statistiche" };

const quota = new Intl.NumberFormat("it-IT", { style: "percent", maximumFractionDigits: 1 });
const qta = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });

/** Statistiche dell'area personale: totali degli ultimi 12 mesi e tutti gli articoli acquistati, per spesa. */
async function Riepilogo() {
  const s = await leggiSessione();
  if (!s || s.ruolo !== "cliente") redirect("/accedi");
  const cliente = await clientePerCodice(s.codiceCliente);
  if (!cliente) redirect("/accedi");
  const r = await riepilogo12m(cliente.id, 10000);

  if (r.articoli.length === 0) {
    return (
      <div className="mt-8 rounded-lg border border-azzurro/40 bg-bianco px-6 py-10 text-center">
        <p className="text-lg">Nessun acquisto negli ultimi 12 mesi.</p>
        <p className="mt-2 text-sm text-slate">Le statistiche si riempiono con i tuoi ordini.</p>
      </div>
    );
  }

  const totali = [
    { etichetta: "Spesa", valore: formattaPrezzo(r.fatturato) },
    { etichetta: "Articoli diversi", valore: String(r.nArticoli) },
    { etichetta: "Righe ordinate", valore: String(r.nOrdini) },
    { etichetta: "Ultimo acquisto", valore: formattaData(r.ultimaData, { day: "numeric", month: "long", year: "numeric" }) },
  ];

  return (
    <>
      <dl className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {totali.map((t) => (
          <div key={t.etichetta} className="rounded-lg border border-azzurro/40 bg-bianco p-5">
            <dt className="etichetta">{t.etichetta}</dt>
            <dd className="prezzo mt-2 text-2xl">{t.valore}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-10">
        <h2 className="text-2xl">Per articolo</h2>
        <p className="mt-1 text-sm text-slate">Dal più al meno speso. La barra mostra la quota sulla spesa totale.</p>
        <div className="mt-4 overflow-x-auto rounded-lg border border-azzurro/40 bg-bianco p-4">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left">
              <tr className="border-b border-azzurro/40">
                <th className="etichetta py-2 pr-4 font-semibold">Articolo</th>
                <th className="etichetta py-2 pl-4 text-right font-semibold">Ordini</th>
                <th className="etichetta py-2 pl-4 text-right font-semibold">Quantità</th>
                <th className="etichetta py-2 pl-4 text-right font-semibold">Spesa</th>
                <th className="etichetta w-32 py-2 pl-4 font-semibold">Quota</th>
              </tr>
            </thead>
            <tbody>
              {r.articoli.map((a) => {
                const q = r.fatturato > 0 ? a.fatturato_12m / r.fatturato : 0;
                return (
                  <tr key={a.cod_dav} className="border-b border-ice align-top">
                    <td className="py-2 pr-4">
                      <Link href={`/catalogo/${encodeURIComponent(a.cod_dav)}`} className="font-semibold leading-snug hover:underline">
                        {a.descrizione}
                      </Link>
                      <p className="text-xs text-slate">{a.cod_dav}</p>
                    </td>
                    <td className="py-2 pl-4 text-right">{a.n_ordini_12m}</td>
                    <td className="whitespace-nowrap py-2 pl-4 text-right">
                      {qta.format(a.qta_12m)} {a.um ?? ""}
                    </td>
                    <td className="whitespace-nowrap py-2 pl-4 text-right">{formattaPrezzo(a.fatturato_12m)}</td>
                    <td className="py-2 pl-4">
                      <div className="flex items-center gap-2">
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ice" aria-hidden="true">
                          <span className="block h-full rounded-full bg-navy" style={{ width: `${Math.max(q * 100, 1)}%` }} />
                        </span>
                        <span className="w-12 text-right text-xs text-slate">{quota.format(q)}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-6 text-xs text-slate">Dati delle vendite DAV degli ultimi 12 mesi, prezzi netti IVA esclusa.</p>
    </>
  );
}

export default function Statistiche() {
  return (
    <Contenitore className="py-8">
      <p className="etichetta">Area personale</p>
      <h1 className="mt-1 text-3xl">Statistiche</h1>
      <p className="mt-1 text-sm text-slate">I tuoi acquisti degli ultimi 12 mesi.</p>
      <Suspense fallback={<p className="mt-6 text-sm text-slate">Carico le statistiche…</p>}>
        <Riepilogo />
      </Suspense>
    </Contenitore>
  );
}
