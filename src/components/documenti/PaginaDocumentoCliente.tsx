import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { Bottone } from "@/components/Bottone";
import { Contenitore } from "@/components/Contenitore";
import { riordinaDocumento } from "@/app/(cliente)/azioni";
import { dettaglioDocumento } from "@/lib/dati/documenti";
import { clientePerCodice } from "@/lib/dati/ordini";
import { leggiSessione } from "@/lib/sessione";
import { DettaglioDocumento } from "./DettaglioDocumento";
import { hrefDocumentoCliente } from "./formato";

type Props = { params: Promise<{ id: string }>; scheda: "ddt" | "fatture" };

/**
 * Pagina di un DDT o di una fattura nell'area cliente. Un id di un altro cliente, o di un documento
 * non più in NTS, dà la stessa pagina "non trovato" di un id inesistente.
 */
async function Contenuto({ params, scheda }: Props) {
  const s = await leggiSessione();
  if (!s || s.ruolo !== "cliente") redirect("/accedi");
  const [{ id }, cliente] = await Promise.all([params, clientePerCodice(s.codiceCliente)]);
  if (!cliente) redirect("/accedi");
  const d = /^\d{1,15}$/.test(id) ? await dettaglioDocumento(Number(id), cliente.id) : null;
  if (!d) notFound();
  // Un DDT aperto dall'indirizzo delle fatture (o viceversa) va al suo indirizzo giusto.
  if ((d.documento.tipo === "ddt") !== (scheda === "ddt")) redirect(hrefDocumentoCliente(d.documento));

  const riordinabili = d.righe.filter((r) => r.tipo_riga === "articolo" && r.in_catalogo && Number(r.quantita) > 0).length;
  const articoli = d.righe.filter((r) => r.tipo_riga === "articolo").length;
  const esclusi = articoli - riordinabili;

  return (
    <DettaglioDocumento
      d={d}
      modo="cliente"
      hrefDocumento={hrefDocumentoCliente}
      hrefOrdine={(o) => `/ordini/${o}`}
      azioni={
        d.documento.tipo === "ddt" && riordinabili > 0 ? (
          <form action={riordinaDocumento}>
            <input type="hidden" name="documento" value={d.documento.id} />
            <Bottone type="submit">Riordina questi articoli</Bottone>
            <p className="mt-2 text-xs text-slate">
              Gli stessi articoli e quantità finiscono nel carrello; poi li modifichi e confermi.
              {esclusi > 0 && ` ${esclusi === 1 ? "Un articolo non è" : `${esclusi} articoli non sono`} nel catalogo online e ${esclusi === 1 ? "resta" : "restano"} fuori.`}
            </p>
          </form>
        ) : null
      }
    />
  );
}

export function PaginaDocumentoCliente(props: Props) {
  return (
    <Contenitore className="py-8">
      <p className="text-sm">
        <Link href={`/ordini?scheda=${props.scheda}`} className="underline underline-offset-2">
          ← {props.scheda === "ddt" ? "I tuoi DDT" : "Le tue fatture"}
        </Link>
      </p>
      <Suspense fallback={<p className="mt-6 text-sm text-slate">Carico il documento…</p>}>
        <Contenuto {...props} />
      </Suspense>
    </Contenitore>
  );
}
