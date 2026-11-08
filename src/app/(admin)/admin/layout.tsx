import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { leggiSessioneAdmin } from "@/lib/sessione";
import { esciAdmin } from "../../(admin-accesso)/admin/accedi/azioni";
import { Contenitore } from "@/components/Contenitore";

export const metadata: Metadata = { title: { default: "Ufficio", template: "%s · Ufficio DAV" }, robots: { index: false, follow: false } };

const voci = [
  { href: "/admin", label: "Cruscotto" },
  { href: "/admin/ordini", label: "Ordini" },
  { href: "/admin/clienti", label: "Clienti" },
  { href: "/admin/impostazioni", label: "Impostazioni" },
];

/** Area ufficio: tutto quello che sta qui sotto richiede la sessione admin. */
export default function LayoutAdmin({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-slate">Caricamento…</p>}>
      <Protetto>{children}</Protetto>
    </Suspense>
  );
}

async function Protetto({ children }: { children: ReactNode }) {
  const s = await leggiSessioneAdmin();
  if (!s) redirect("/admin/accedi");
  return (
    <>
      <header className="sticky top-0 z-20 border-b border-ice bg-bianco/95 backdrop-blur">
        <Contenitore className="flex h-16 items-center justify-between gap-4">
          <Link href="/admin" className="flex shrink-0 items-center gap-3" aria-label="Cruscotto ufficio">
            <Logo compatto />
            <span className="etichetta hidden md:inline">Ufficio</span>
          </Link>
          <nav aria-label="Area ufficio" className="flex items-center gap-4 overflow-x-auto text-sm font-semibold md:gap-6">
            {voci.map((v) => (
              <Link key={v.href} href={v.href} className="whitespace-nowrap text-navy hover:text-slate">
                {v.label}
              </Link>
            ))}
          </nav>
          <form action={esciAdmin}>
            <button type="submit" className="rounded-md border border-navy px-4 py-2 text-sm font-semibold text-navy hover:bg-ice">
              Esci
            </button>
          </form>
        </Contenitore>
      </header>
      <main className="flex-1">{children}</main>
    </>
  );
}
