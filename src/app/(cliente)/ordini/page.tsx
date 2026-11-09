import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { BottoneLink } from "@/components/Bottone";
import { formattaPrezzo } from "@/lib/dati/catalogo";
import { clientePerCodice, ETICHETTA_CLIENTE, formattaData, ordiniCliente, type Cliente } from "@/lib/dati/ordini";
import { elencoDocumenti, mesiDocumenti, type TipoDocumento } from "@/lib/dati/documenti";
import { leggiSessione } from "@/lib/sessione";
import { Contenitore } from "@/components/Contenitore";
import { ElencoDocumenti } from "@/components/documenti/ElencoDocumenti";
import { hrefDocumentoCliente } from "@/components/documenti/formato";
import { leggiScheda, SchedeOrdini, type Scheda } from "@/components/documenti/SchedeOrdini";

export const metadata: Metadata = { title: "Ordini e documenti" };

type Props = { searchParams: Promise<{ scheda?: string; mese?: string; pagina?: string }> };

async function clienteCorrente(): Promise<Cliente> {
  const s = await leggiSessione();
  if (!s || s.ruolo !== "cliente") redirect("/accedi");
  const cliente = await clientePerCodice(s.codiceCliente);
  if (!cliente) redirect("/accedi");
  return cliente;
}

async function Ordini() {
  const cliente = await clienteCorrente();
  const ordini = await ordiniCliente(cliente.id);

  if (ordini.length === 0) {
    return (
      <div className="mt-8 rounded-lg border border-azzurro/40 bg-bianco px-6 py-10 text-center">
        <p className="text-lg">Nessun ordine ancora.</p>
        <p className="mt-2 text-sm text-slate">Il primo lo fai dal carrello in meno di un minuto.</p>
        <div className="mt-6">
          <BottoneLink href="/home">Vai alla home</BottoneLink>
        </div>
      </div>
    );
  }

  return (
    <ul className="mt-6 divide-y divide-azzurro/40 rounded-lg border border-azzurro/40 bg-bianco">
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
              <p className="text-xs font-semibold text-slate">{ETICHETTA_CLIENTE[o.stato]}</p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

const TIPI: Record<Exclude<Scheda, "ordini">, TipoDocumento[]> = { ddt: ["ddt"], fatture: ["fattura", "nota_credito"] };

async function Documenti({ scheda, mese, pagina }: { scheda: Exclude<Scheda, "ordini">; mese: string | null; pagina: number }) {
  const cliente = await clienteCorrente();
  const tipi = TIPI[scheda];
  const [elenco, mesi] = await Promise.all([elencoDocumenti(cliente.id, { tipi, mese, pagina }), mesiDocumenti(cliente.id, tipi)]);
  const nome = scheda === "ddt" ? "DDT" : "fatture";

  if (!elenco.disponibile) {
    return (
      <div className="mt-8 rounded-lg border border-azzurro/40 bg-bianco px-6 py-10 text-center">
        <p className="text-lg">I tuoi {nome} arrivano presto qui.</p>
        <p className="mt-2 text-sm text-slate">Li stiamo collegando al gestionale: li troverai in questa pagina, aggiornati ogni 15 minuti.</p>
      </div>
    );
  }

  return (
    <>
      <p className="mt-4 text-sm text-slate">
        {scheda === "ddt"
          ? "I documenti di trasporto delle tue consegne degli ultimi 24 mesi. Da ogni DDT puoi riordinare gli stessi articoli."
          : "Fatture e note di credito degli ultimi 24 mesi, con lo stato del pagamento."}
      </p>
      <ElencoDocumenti
        elenco={elenco}
        mesi={mesi}
        meseAttivo={mese}
        base={{ scheda }}
        percorso="/ordini"
        href={hrefDocumentoCliente}
        vuoto={
          <>
            <p className="text-lg">{mese ? `Nessun documento in questo mese.` : `Nessun ${scheda === "ddt" ? "DDT" : "documento"} negli ultimi 24 mesi.`}</p>
            {mese && (
              <p className="mt-2 text-sm">
                <Link href={`/ordini?scheda=${scheda}`} className="underline underline-offset-2">
                  Vedi tutti i mesi
                </Link>
              </p>
            )}
          </>
        }
      />
    </>
  );
}

export default async function PaginaOrdini({ searchParams }: Props) {
  const sp = await searchParams;
  const scheda = leggiScheda(sp.scheda);
  const mese = sp.mese && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mese) ? sp.mese : null;
  const pagina = Math.max(1, Math.floor(Number(sp.pagina) || 1));
  return (
    <Contenitore className="py-8">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <p className="etichetta">Ordini e documenti</p>
          <h1 className="mt-1 text-3xl">{scheda === "ordini" ? "I tuoi ordini" : scheda === "ddt" ? "I tuoi DDT" : "Le tue fatture"}</h1>
        </div>
        <Link href="/pagamenti" className="text-sm font-semibold underline underline-offset-4">
          Scadenze e pagamenti
        </Link>
      </div>
      <SchedeOrdini attiva={scheda} />
      <Suspense key={`${scheda}|${mese}|${pagina}`} fallback={<p className="mt-6 text-sm text-slate">Carico…</p>}>
        {scheda === "ordini" ? <Ordini /> : <Documenti scheda={scheda} mese={mese} pagina={pagina} />}
      </Suspense>
    </Contenitore>
  );
}
