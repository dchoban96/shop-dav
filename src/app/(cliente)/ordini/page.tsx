import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { BottoneLink } from "@/components/Bottone";
import { formattaPrezzo } from "@/lib/dati/catalogo";
import { clientePerCodice, ETICHETTA_STATO, formattaData, ordiniCliente } from "@/lib/dati/ordini";
import { leggiSessione } from "@/lib/sessione";
import { Contenitore } from "@/components/Contenitore";

export const metadata: Metadata = { title: "Ordini" };

async function Elenco() {
  const s = await leggiSessione();
  if (!s || s.ruolo !== "cliente") redirect("/accedi");
  const cliente = await clientePerCodice(s.codiceCliente);
  if (!cliente) redirect("/accedi");
  const ordini = await ordiniCliente(cliente.id);

  if (ordini.length === 0) {
    return (
      <div className="mt-8 rounded-lg bg-ice px-6 py-10 text-center">
        <p className="text-lg">Nessun ordine ancora.</p>
        <p className="mt-2 text-sm text-slate">Il primo lo fai dal carrello in meno di un minuto.</p>
        <div className="mt-6">
          <BottoneLink href="/home">Vai alla home</BottoneLink>
        </div>
      </div>
    );
  }

  return (
    <ul className="mt-6 divide-y divide-azzurro/40 rounded-lg border border-azzurro/40">
      {ordini.map((o) => (
        <li key={o.id}>
          <Link href={`/ordini/${o.id}`} className="flex items-center justify-between gap-4 px-4 py-4 hover:bg-ice">
            <div>
              <p className="font-semibold">Ordine n. {o.numero}</p>
              <p className="text-sm text-slate">
                {formattaData(o.creato_il)} · consegna {formattaData(o.data_consegna_richiesta, { day: "numeric", month: "short" })}
              </p>
            </div>
            <div className="text-right">
              <p className="prezzo">{formattaPrezzo(o.totale_netto)}</p>
              <p className="text-xs font-semibold text-slate">{ETICHETTA_STATO[o.stato]}</p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function Ordini() {
  return (
    <Contenitore className="py-8">
      <p className="etichetta">Ordini</p>
      <h1 className="mt-1 text-3xl">I tuoi ordini</h1>
      <Suspense fallback={<p className="mt-6 text-sm text-slate">Carico gli ordini…</p>}>
        <Elenco />
      </Suspense>
    </Contenitore>
  );
}
