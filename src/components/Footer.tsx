import Link from "next/link";
import { Logo } from "./Logo";
import { azienda, navigazionePubblica } from "@/lib/azienda";
import { Contenitore } from "@/components/Contenitore";

const ANNO = new Date().getFullYear();

export function Footer() {
  return (
    <footer className="mt-auto border-t border-ice bg-ice">
      <Contenitore className="grid gap-8 py-10 md:grid-cols-3">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm text-slate">{azienda.descrizioneBreve}</p>
        </div>

        <div>
          <p className="etichetta">Contatti</p>
          <ul className="mt-3 space-y-1 text-sm">
            <li>{azienda.ragioneSociale}</li>
            <li>{azienda.indirizzo}</li>
            <li>
              {azienda.cap} {azienda.sede}
            </li>
            <li>
              <a href={`mailto:${azienda.email}`} className="underline underline-offset-2">
                {azienda.email}
              </a>
            </li>
            {azienda.telefonoOrdini && (
              <li>
                Tel.{" "}
                <a href={`tel:${azienda.telefonoOrdini.replace(/\s/g, "")}`} className="underline underline-offset-2">
                  {azienda.telefonoOrdini}
                </a>
              </li>
            )}
            {azienda.whatsapp && (
              <li>
                WhatsApp{" "}
                <a href={`https://wa.me/${azienda.whatsapp.replace(/\D/g, "")}`} className="underline underline-offset-2">
                  {azienda.whatsapp}
                </a>
              </li>
            )}
            {azienda.instagram && (
              <li>
                <a href={`https://www.instagram.com/${azienda.instagram}/`} className="underline underline-offset-2" rel="noopener">
                  Instagram @{azienda.instagram}
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
      </Contenitore>
      <div className="border-t border-azzurro/40">
        <Contenitore className="py-4">
          <p className="text-xs text-slate">
            © {ANNO} {azienda.ragioneSociale} · {azienda.nomeEsteso} · P. IVA {azienda.partitaIva} · Codice univoco {azienda.codiceUnivoco}
          </p>
        </Contenitore>
      </div>
    </footer>
  );
}
