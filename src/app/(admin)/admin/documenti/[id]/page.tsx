import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Contenitore } from "@/components/Contenitore";
import { DettaglioDocumento } from "@/components/documenti/DettaglioDocumento";
import { hrefDocumentoAdmin } from "@/components/documenti/formato";
import { dettaglioDocumento } from "@/lib/dati/documenti";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const metadata = { title: "Documento" };

type Props = { params: Promise<{ id: string }> };

/** DDT o fattura vista dall'ufficio: descrizioni NTS, chiave, anche se il documento non è più in NTS. */
async function Contenuto({ params }: Props) {
  const { id } = await params;
  const d = /^\d{1,15}$/.test(id) ? await dettaglioDocumento(Number(id), null) : null;
  if (!d) notFound();
  const { data: cliente } = await supabaseAdmin().from("clienti").select("id, codice_nts, ragione_sociale").eq("id", d.documento.cliente_id).maybeSingle();
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={`/admin/clienti/${d.documento.cliente_id}`} className="underline underline-offset-2">
          ← {cliente ? `${cliente.ragione_sociale} (${cliente.codice_nts})` : "Cliente"}
        </Link>
      </p>
      <DettaglioDocumento d={d} modo="admin" hrefDocumento={hrefDocumentoAdmin} hrefOrdine={(o) => `/admin/ordini/${o}`} />
    </>
  );
}

export default function DocumentoAdmin({ params }: Props) {
  return (
    <Contenitore className="py-8">
      <Suspense fallback={<p className="text-sm text-slate">Carico il documento…</p>}>
        <Contenuto params={params} />
      </Suspense>
    </Contenitore>
  );
}
