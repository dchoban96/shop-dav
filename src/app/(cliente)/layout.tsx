import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { HeaderCliente } from "@/components/HeaderCliente";
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
  return (
    <>
      <HeaderCliente codiceCliente={sessione.codiceCliente} demo={sessione.demo} />
      <main className="flex-1 pb-20 md:pb-0">{children}</main>
    </>
  );
}
