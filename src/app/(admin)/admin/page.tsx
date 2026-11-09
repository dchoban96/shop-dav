import Link from "next/link";
import { Suspense } from "react";
import { BadgeStato } from "@/components/admin/StatoOrdine";
import { formattaPrezzo } from "@/lib/dati/catalogo";
import { elencoOrdini, leggiCruscotto } from "@/lib/dati/admin";
import { formattaData } from "@/lib/dati/ordini";
import { Contenitore } from "@/components/Contenitore";
import { PannelloNts } from "@/components/admin/PannelloNts";
import { PannelloSync } from "@/components/admin/PannelloSync";
import { contaDaControllare } from "@/lib/dati/nts";

export const metadata = { title: "Cruscotto" };

async function Contenuto() {
  const [c, daGestire, daControllare] = await Promise.all([leggiCruscotto(), elencoOrdini({ stato: "inviato" }), contaDaControllare()]);
  const numeri = [
    { valore: daControllare ?? "—", testo: "ordini da controllare (NTS)", href: "/admin/ordini?nts=da_controllare" },
    { valore: c.daGestire, testo: "ordini ricevuti, non ancora in NTS", href: "/admin/ordini?stato=inviato" },
    { valore: c.oggi, testo: "ordini di oggi", href: "/admin/ordini" },
    { valore: c.clienti, testo: "clienti da gestionale", href: "/admin/clienti" },
    { valore: c.clientiDemo, testo: "clienti demo", href: "/admin/clienti?demo=1" },
  ];
  return (
    <>
      <PannelloNts />
      <PannelloSync />
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {numeri.map((n) => (
          <Link key={n.testo} href={n.href} className="rounded-lg bg-ice p-5 hover:bg-azzurro/30">
            <dd className="font-serif text-4xl">{n.valore}</dd>
            <dt className="mt-1 text-sm text-slate">{n.testo}</dt>
          </Link>
        ))}
      </dl>

      <section className="mt-10">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-2xl">Ricevuti, non ancora in NTS</h2>
          <Link href="/admin/ordini?stato=inviato" className="text-sm font-semibold underline underline-offset-4">
            Tutti
          </Link>
        </div>
        {daGestire.ordini.length === 0 ? (
          <p className="mt-4 rounded-md bg-ice px-4 py-6 text-center text-sm text-slate">Nessun ordine in attesa.</p>
        ) : (
          <ul className="mt-4 divide-y divide-ice rounded-lg border border-azzurro/40">
            {daGestire.ordini.slice(0, 10).map((o) => (
              <li key={o.id}>
                <Link href={`/admin/ordini/${o.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-ice">
                  <span>
                    <span className="font-semibold">n. {o.numero}</span> · {o.cliente?.ragione_sociale}{" "}
                    <span className="text-sm text-slate">({o.cliente?.codice_nts})</span>
                  </span>
                  <span className="flex items-center gap-3 text-sm text-slate">
                    consegna {formattaData(o.data_consegna_richiesta, { day: "numeric", month: "short" })} · {o.n_righe} righe ·{" "}
                    <span className="prezzo text-base text-navy">{formattaPrezzo(o.totale_netto)}</span>
                    <BadgeStato stato={o.stato} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-2xl">Ultimi import</h2>
        {c.ultimiImport.length === 0 ? (
          <p className="mt-4 text-sm text-slate">Nessun import registrato.</p>
        ) : (
          <table className="mt-4 w-full text-sm">
            <thead className="text-left">
              <tr className="border-b border-azzurro/40">
                <th className="etichetta py-2">Tipo</th>
                <th className="etichetta py-2">File</th>
                <th className="etichetta py-2 text-right">Righe</th>
                <th className="etichetta py-2 text-right">Errori</th>
                <th className="etichetta py-2 text-right">Quando</th>
              </tr>
            </thead>
            <tbody>
              {c.ultimiImport.map((r) => (
                <tr key={r.tipo} className="border-b border-ice">
                  <td className="py-2 font-semibold">{r.tipo}</td>
                  <td className="py-2 text-slate">{r.nome_file}</td>
                  <td className="py-2 text-right">{r.righe_lette}</td>
                  <td className="py-2 text-right">{r.errori}</td>
                  <td className="py-2 text-right text-slate">
                    {formattaData(r.eseguito_il, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-xs text-slate">Gli import si lanciano da riga di comando (npm run import); la pagina di caricamento arriva in seguito.</p>
      </section>
    </>
  );
}

export default function Cruscotto() {
  return (
    <Contenitore className="py-8">
      <p className="etichetta">Ufficio DAV</p>
      <h1 className="mt-1 text-3xl">Cruscotto</h1>
      <div className="mt-6">
        <Suspense fallback={<p className="text-sm text-slate">Carico…</p>}>
          <Contenuto />
        </Suspense>
      </div>
    </Contenitore>
  );
}
