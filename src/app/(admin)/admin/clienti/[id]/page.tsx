import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { BadgeStato } from "@/components/admin/StatoOrdine";
import { formattaPrezzo } from "@/lib/dati/catalogo";
import { schedaCliente } from "@/lib/dati/admin";
import { formattaData, GIORNI_SETTIMANA, storicoCliente } from "@/lib/dati/ordini";
import { Contenitore } from "@/components/Contenitore";

export const metadata = { title: "Cliente" };

type Props = { params: Promise<{ id: string }> };

const testo = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

async function Scheda({ params }: Props) {
  const { id } = await params;
  const n = Number(id);
  const dati = Number.isInteger(n) ? await schedaCliente(n) : null;
  if (!dati) notFound();
  const storico = await storicoCliente(n, 30);
  const c = dati.cliente;
  const giorni = (c.giorni_consegna as number[] | null) ?? [];

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="etichetta">{c.codice_nts}</p>
          <h1 className="mt-1 text-3xl">{c.ragione_sociale}</h1>
          {c.demo && <p className="mt-1 text-sm text-slate">Cliente creato da un accesso demo, non dal gestionale.</p>}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg bg-ice p-5 text-sm">
          <h2 className="text-xl">Anagrafica</h2>
          <dl className="mt-3 grid grid-cols-[150px_1fr] gap-y-1.5">
            <dt className="text-slate">Indirizzo</dt>
            <dd>{[c.indirizzo, c.cap, c.comune, c.provincia].filter(Boolean).join(", ") || "—"}</dd>
            <dt className="text-slate">Email</dt>
            <dd>{testo(c.email)}</dd>
            <dt className="text-slate">Partita IVA</dt>
            <dd>{testo(c.piva)}</dd>
            <dt className="text-slate">Agente</dt>
            <dd>{testo(c.agente_codice)}</dd>
            <dt className="text-slate">Giorni consegna</dt>
            <dd>{giorni.length ? giorni.map((g) => GIORNI_SETTIMANA[g - 1]).join(", ") : "—"}</dd>
            <dt className="text-slate">Pagamento</dt>
            <dd>{testo(c.metodo_pagamento)}</dd>
            <dt className="text-slate">Telefoni ordini</dt>
            <dd>
              {dati.telefoni.length
                ? dati.telefoni.map((t) => `${t.numero_e164}${t.nome_contatto ? ` (${t.nome_contatto})` : ""}${t.usa_whatsapp ? " · WhatsApp" : ""}`).join("; ")
                : "—"}
            </dd>
          </dl>
        </section>

        <section className="rounded-lg border border-azzurro/40 p-5 text-sm">
          <h2 className="text-xl">Condizioni commerciali</h2>
          {dati.condizioni.length === 0 ? (
            <p className="mt-3 text-slate">Nessuna condizione importata: vale il listino.</p>
          ) : (
            <table className="mt-3 w-full">
              <thead className="text-left">
                <tr className="border-b border-azzurro/40">
                  <th className="etichetta py-1.5">Su</th>
                  <th className="etichetta py-1.5 text-right">Sconti</th>
                  <th className="etichetta py-1.5 text-right">Prezzo fisso</th>
                </tr>
              </thead>
              <tbody>
                {dati.condizioni.map((k, i) => (
                  <tr key={i} className="border-b border-ice">
                    <td className="py-1.5">
                      <span className="text-xs text-slate">{k.tipo}</span> {k.riferimento}
                    </td>
                    <td className="py-1.5 text-right">{[k.sconto1, k.sconto2].filter((s) => s > 0).map((s) => `${s}%`).join(" + ") || "—"}</td>
                    <td className="py-1.5 text-right">{formattaPrezzo(k.prezzo_accordato) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-3 text-xs text-slate">Sola lettura: le condizioni si aggiornano dall’export NTS.</p>
        </section>
      </div>

      <section className="mt-8">
        <h2 className="text-2xl">Ordini dal portale</h2>
        {dati.ordini.length === 0 ? (
          <p className="mt-3 text-sm text-slate">Nessun ordine.</p>
        ) : (
          <ul className="mt-3 divide-y divide-ice rounded-lg border border-azzurro/40">
            {dati.ordini.map((o) => (
              <li key={o.id}>
                <Link href={`/admin/ordini/${o.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-ice">
                  <span>
                    <span className="font-semibold">n. {o.numero}</span>{" "}
                    <span className="text-sm text-slate">{formattaData(o.creato_il, { day: "numeric", month: "short", year: "numeric" })}</span>
                  </span>
                  <span className="flex items-center gap-3 text-sm">
                    {o.n_righe} righe · {formattaPrezzo(o.totale_netto)} <BadgeStato stato={o.stato} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-2xl">Articoli abituali</h2>
        {storico.length === 0 ? (
          <p className="mt-3 text-sm text-slate">Nessuno storico: arriva con l’import delle vendite o con i primi ordini.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-azzurro/40">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-ice text-left">
                <tr>
                  <th className="etichetta px-3 py-2">Articolo</th>
                  <th className="etichetta px-3 py-2">Marchio</th>
                  <th className="etichetta px-3 py-2 text-right">Ordini 12 mesi</th>
                  <th className="etichetta px-3 py-2 text-right">Quantità 12 mesi</th>
                  <th className="etichetta px-3 py-2 text-right">Fatturato 12 mesi</th>
                  <th className="etichetta px-3 py-2 text-right">Ultimo</th>
                </tr>
              </thead>
              <tbody>
                {storico.map((v) => (
                  <tr key={v.cod_dav} className="border-t border-ice">
                    <td className="px-3 py-2">
                      {v.descrizione} <span className="text-xs text-slate">{v.cod_dav}</span>
                    </td>
                    <td className="px-3 py-2 text-slate">{v.marchio ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{v.n_ordini_12m}</td>
                    <td className="px-3 py-2 text-right">{v.qta_12m}</td>
                    <td className="px-3 py-2 text-right">{formattaPrezzo(v.fatturato_12m)}</td>
                    <td className="px-3 py-2 text-right text-slate">{formattaData(v.ultima_data, { month: "2-digit", year: "numeric" })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

export default function ClienteAdmin({ params }: Props) {
  return (
    <Contenitore className="py-8">
      <p className="mb-4 text-sm">
        <Link href="/admin/clienti" className="underline underline-offset-2">
          ← Clienti
        </Link>
      </p>
      <Suspense fallback={<p className="text-sm text-slate">Carico la scheda…</p>}>
        <Scheda params={params} />
      </Suspense>
    </Contenitore>
  );
}
