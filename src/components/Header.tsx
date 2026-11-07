import Link from "next/link";
import { Logo } from "./Logo";
import { BottoneLink } from "./Bottone";
import { navigazionePubblica } from "@/lib/azienda";

export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-ice bg-bianco/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" aria-label="Home DAV" className="shrink-0">
          <Logo compatto />
        </Link>

        <nav aria-label="Principale" className="hidden items-center gap-6 md:flex">
          {navigazionePubblica.map((voce) => (
            <Link
              key={voce.href}
              href={voce.href}
              className="text-sm font-semibold text-navy hover:text-slate"
            >
              {voce.label}
            </Link>
          ))}
        </nav>

        <BottoneLink href="/accedi" className="shrink-0">
          Area clienti
        </BottoneLink>
      </div>

      <nav
        aria-label="Principale mobile"
        className="flex items-center gap-5 overflow-x-auto border-t border-ice px-4 py-2 md:hidden"
      >
        {navigazionePubblica.map((voce) => (
          <Link
            key={voce.href}
            href={voce.href}
            className="whitespace-nowrap text-sm font-semibold text-navy"
          >
            {voce.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
