import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { HeaderCliente } from "@/components/HeaderCliente";
import { clientePerCodice, contaCarrello } from "@/lib/dati/ordini";
import { leggiSessione } from "@/lib/sessione";

/** Area cliente: tutto quello che sta qui sotto richiede una sessione valida. */
export default function LayoutCliente({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-slate">Caricamento…</p>}>
      <Protetto>{children}</Protetto>
    </Suspense>
  );
}

async function Protetto({ children }: { children: ReactNode }) {
  const sessione = await leggiSessione();
  if (!sessione) redirect("/accedi");
  if (sessione.ruolo !== "cliente") redirect("/admin");
  const cliente = await clientePerCodice(sessione.codiceCliente);
  if (!cliente) redirect("/accedi");
  const nelCarrello = await contaCarrello(cliente.id);
  return (
    <>
      <HeaderCliente codiceCliente={cliente.codice_nts} ragioneSociale={cliente.ragione_sociale} demo={sessione.demo || cliente.demo} nelCarrello={nelCarrello} />
      <main className="flex-1 bg-ice pb-20 md:pb-0">{children}</main>
    </>
  );
}
