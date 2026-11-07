import Link from "next/link";
import { Logo } from "./Logo";
import { azienda, navigazionePubblica } from "@/lib/azienda";

const ANNO = new Date().getFullYear();

export function Footer() {
  return (
    <footer className="mt-auto border-t border-ice bg-ice">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-3">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm text-slate">{azienda.descrizioneBreve}</p>
        </div>

        <div>
          <p className="etichetta">Contatti</p>
          <ul className="mt-3 space-y-1 text-sm">
            <li>{azienda.ragioneSociale}</li>
            {azienda.indirizzo && <li>{azienda.indirizzo}</li>}
            <li>{azienda.sede}</li>
            <li>
              <a href={`mailto:${azienda.email}`} className="underline underline-offset-2">
                {azienda.email}
              </a>
            </li>
            {azienda.telefonoOrdini && (
              <li>
                Ordini:{" "}
                <a href={`tel:${azienda.telefonoOrdini}`} className="underline underline-offset-2">
                  {azienda.telefonoOrdini}
                </a>
              </li>
            )}
          </ul>
        </div>

        <div>
          <p className="etichetta">Sito</p>
          <ul className="mt-3 space-y-1 text-sm">
            {navigazionePubblica.map((voce) => (
              <li key={voce.href}>
                <Link href={voce.href} className="hover:underline">
                  {voce.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/accedi" className="hover:underline">
                Area clienti
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-azzurro/40">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-slate">
          © {ANNO} {azienda.ragioneSociale} · {azienda.nomeEsteso}
        </p>
      </div>
    </footer>
  );
}
