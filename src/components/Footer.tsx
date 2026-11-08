import Link from "next/link";
import { Contenitore } from "./Contenitore";
import { Emblema } from "./Logo";
import { azienda, navigazionePubblica } from "@/lib/azienda";

const ANNO = new Date().getFullYear();
const link = "hover:underline underline-offset-2";

/** Piè di pagina pubblico: fascia navy (superficie grande ammessa dalle linee guida), testo bianco e azzurro. */
export function Footer() {
  return (
    <footer className="mt-auto bg-navy text-bianco">
      <Contenitore className="grid gap-10 py-12 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <span className="flex items-center gap-3">
            <Emblema size={40} bianco />
            <span className="font-serif text-2xl">{azienda.nomeBreve}</span>
          </span>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-azzurro">{azienda.descrizioneBreve}</p>
        </div>

        <div>
          <p className="etichetta text-azzurro">Contatti</p>
          <ul className="mt-3 space-y-1.5 text-sm">
            <li>{azienda.ragioneSociale}</li>
            <li>{azienda.indirizzo}</li>
            <li>
              {azienda.cap} {azienda.sede}
            </li>
            <li>
              <a href={`mailto:${azienda.email}`} className={link}>
                {azienda.email}
              </a>
            </li>
            {azienda.telefonoOrdini && (
              <li>
                Tel.{" "}
                <a href={`tel:${azienda.telefonoOrdini.replace(/\s/g, "")}`} className={link}>
                  {azienda.telefonoOrdini}
                </a>
              </li>
            )}
            {azienda.whatsapp && (
              <li>
                WhatsApp{" "}
                <a href={`https://wa.me/${azienda.whatsapp.replace(/\D/g, "")}`} className={link}>
                  {azienda.whatsapp}
                </a>
              </li>
            )}
            {azienda.instagram && (
              <li>
                <a href={`https://www.instagram.com/${azienda.instagram}/`} className={link} rel="noopener">
                  Instagram @{azienda.instagram}
                </a>
              </li>
            )}
          </ul>
        </div>

        <div>
          <p className="etichetta text-azzurro">Sito</p>
          <ul className="mt-3 space-y-1.5 text-sm">
            {navigazionePubblica.map((voce) => (
              <li key={voce.href}>
                <Link href={voce.href} className={link}>
                  {voce.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/accedi" className={link}>
                Area clienti
              </Link>
            </li>
          </ul>
        </div>
      </Contenitore>
      <div className="border-t border-bianco/15">
        <Contenitore className="py-4">
          <p className="text-xs text-azzurro">
            © {ANNO} {azienda.ragioneSociale} · {azienda.nomeEsteso} · P. IVA {azienda.partitaIva} · Codice univoco {azienda.codiceUnivoco}
          </p>
        </Contenitore>
      </div>
    </footer>
  );
}
