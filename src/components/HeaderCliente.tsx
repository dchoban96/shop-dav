import Link from "next/link";
import { Logo } from "./Logo";
import { Contenitore } from "./Contenitore";
import { esci } from "@/app/(pubblico)/accedi/azioni";
import { MenuCliente } from "./MenuCliente";

const voci = [
  { href: "/home", label: "Home" },
  { href: "/catalogo", label: "Catalogo" },
  { href: "/marchi", label: "Marchi" },
  { href: "/carrello", label: "Carrello" },
  { href: "/ordini", label: "Ordini" },
] as const;

type Props = { codiceCliente: string; ragioneSociale?: string; demo: boolean; nelCarrello: number };

/** Testata dell'area clienti: logo, ricerca sempre a portata di mano, voci, cliente, uscita. */
export function HeaderCliente({ codiceCliente, ragioneSociale, demo, nelCarrello }: Props) {
  return (
    <>
      <header className="sticky top-0 z-20 border-b border-azzurro/40 bg-bianco">
        <Contenitore className="flex h-16 items-center gap-4 lg:gap-6">
          <Link href="/home" aria-label="Home area clienti" className="shrink-0">
            <Logo compatto />
          </Link>
          <Ricerca className="hidden min-w-0 flex-1 md:block lg:max-w-md" id="ricerca-testata" />
          <nav aria-label="Area clienti" className="hidden items-center gap-5 md:flex">
            {voci.map((v) => (
              <Voce key={v.href} {...v} badge={v.href === "/carrello" ? nelCarrello : 0} />
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {/* Area personale: ordini, DDT, fatture, pagamenti, statistiche */}
            <MenuCliente ragioneSociale={ragioneSociale} codiceCliente={codiceCliente} />
            <form action={esci}>
              <button type="submit" className="rounded-md border border-navy px-4 py-2 text-sm font-semibold text-navy hover:bg-ice">
                Esci
              </button>
            </form>
          </div>
        </Contenitore>
        <div className="border-t border-ice px-4 py-2 md:hidden">
          <Ricerca id="ricerca-testata-mobile" />
        </div>
        {demo && (
          <p className="border-t border-ice bg-ice px-4 py-1.5 text-center text-xs text-slate">
            Accesso demo: gli ordini vengono registrati ma non inviati via email.
          </p>
        )}
      </header>

      <nav aria-label="Area clienti mobile" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-azzurro/40 bg-bianco md:hidden">
        {voci.map((v) => (
          <Voce key={v.href} {...v} badge={v.href === "/carrello" ? nelCarrello : 0} mobile />
        ))}
      </nav>
    </>
  );
}

function Ricerca({ id, className }: { id: string; className?: string }) {
  return (
    <form method="get" action="/catalogo" role="search" className={className}>
      <label htmlFor={id} className="sr-only">
        Cerca un articolo
      </label>
      <input
        id={id}
        name="q"
        type="search"
        placeholder="Cerca per nome o codice"
        className="h-10 w-full rounded-md border border-azzurro bg-bianco px-4 text-sm placeholder:text-slate"
      />
    </form>
  );
}

function Voce({ href, label, badge, mobile = false }: { href: string; label: string; badge: number; mobile?: boolean }) {
  const base = mobile ? "flex min-h-14 items-center justify-center gap-1.5 text-sm font-semibold" : "flex items-center gap-1.5 text-sm font-semibold hover:text-slate";
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
