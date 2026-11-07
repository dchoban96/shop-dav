import Link from "next/link";
import { Logo } from "./Logo";
import { esci } from "@/app/(pubblico)/accedi/azioni";

const voci = [
  { href: "/home", label: "Home" },
  { href: "/catalogo", label: "Catalogo" },
  { href: "/carrello", label: "Carrello" },
  { href: "/ordini", label: "Ordini" },
] as const;

type Props = { codiceCliente: string; ragioneSociale?: string; demo: boolean; nelCarrello: number };

export function HeaderCliente({ codiceCliente, ragioneSociale, demo, nelCarrello }: Props) {
  return (
    <>
      <header className="sticky top-0 z-20 border-b border-ice bg-bianco/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/home" aria-label="Home area clienti" className="shrink-0">
            <Logo compatto />
          </Link>
          <nav aria-label="Area clienti" className="hidden items-center gap-6 md:flex">
            {voci.map((v) => (
              <Voce key={v.href} {...v} badge={v.href === "/carrello" ? nelCarrello : 0} />
            ))}
          </nav>
          <div className="flex items-center gap-4">
            <span className="hidden max-w-[220px] truncate text-sm text-slate sm:inline" title={ragioneSociale}>
              {ragioneSociale ?? "Cliente"} <span className="font-semibold text-navy">{codiceCliente}</span>
            </span>
            <form action={esci}>
              <button type="submit" className="rounded-md border border-navy px-4 py-2 text-sm font-semibold text-navy hover:bg-ice">
                Esci
              </button>
            </form>
          </div>
        </div>
        {demo && (
          <p className="bg-ice px-4 py-1.5 text-center text-xs text-slate">
            Accesso demo: gli ordini vengono registrati ma non inviati via email.
          </p>
        )}
      </header>

      <nav aria-label="Area clienti mobile" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-ice bg-bianco md:hidden">
        {voci.map((v) => (
          <Voce key={v.href} {...v} badge={v.href === "/carrello" ? nelCarrello : 0} mobile />
        ))}
      </nav>
    </>
  );
}

function Voce({ href, label, badge, mobile = false }: { href: string; label: string; badge: number; mobile?: boolean }) {
  const base = mobile ? "flex min-h-14 items-center justify-center gap-1.5 text-sm font-semibold" : "flex items-center gap-1.5 text-sm font-semibold";
  return (
    <Link href={href} className={`${base} text-navy`}>
      {label}
      {badge > 0 && (
        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-navy px-1.5 text-[11px] font-semibold text-bianco" aria-label={`${badge} righe nel carrello`}>
          {badge}
        </span>
      )}
    </Link>
  );
}
