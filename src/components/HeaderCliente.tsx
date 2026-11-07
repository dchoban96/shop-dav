import Link from "next/link";
import { Logo } from "./Logo";
import { esci } from "@/app/(pubblico)/accedi/azioni";

const voci = [
  { href: "/home", label: "Home", attiva: true },
  { href: "/catalogo", label: "Catalogo", attiva: true },
  { href: "/carrello", label: "Carrello", attiva: false },
  { href: "/ordini", label: "Ordini", attiva: false },
] as const;

type Props = { codiceCliente: string; demo: boolean };

export function HeaderCliente({ codiceCliente, demo }: Props) {
  return (
    <>
      <header className="sticky top-0 z-20 border-b border-ice bg-bianco/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/home" aria-label="Home area clienti" className="shrink-0">
            <Logo compatto />
          </Link>
          <nav aria-label="Area clienti" className="hidden items-center gap-6 md:flex">
            {voci.map((v) => <Voce key={v.href} {...v} />)}
          </nav>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-slate sm:inline">
              Cliente <span className="font-semibold text-navy">{codiceCliente}</span>
            </span>
            <form action={esci}>
              <button
                type="submit"
                className="rounded-md border border-navy px-4 py-2 text-sm font-semibold text-navy hover:bg-ice"
              >
                Esci
              </button>
            </form>
          </div>
        </div>
        {demo && (
          <p className="bg-ice px-4 py-1.5 text-center text-xs text-slate">
            Accesso demo: dati di esempio, nessun ordine viene inviato.
          </p>
        )}
      </header>

      <nav
        aria-label="Area clienti mobile"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-ice bg-bianco md:hidden"
      >
        {voci.map((v) => (
          <Voce key={v.href} {...v} mobile />
        ))}
      </nav>
    </>
  );
}

function Voce({
  href,
  label,
  attiva,
  mobile = false,
}: {
  href: string;
  label: string;
  attiva: boolean;
  mobile?: boolean;
}) {
  const base = mobile
    ? "flex min-h-14 items-center justify-center text-sm font-semibold"
    : "text-sm font-semibold";
  if (!attiva) {
    return (
      <span className={`${base} text-slate/60`} aria-disabled="true" title="In arrivo">
        {label}
      </span>
    );
  }
  return (
    <Link href={href} className={`${base} text-navy`}>
      {label}
    </Link>
  );
}
