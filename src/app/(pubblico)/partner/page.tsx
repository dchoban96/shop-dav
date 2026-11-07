import type { Metadata } from "next";
import { Sezione } from "@/components/Sezione";

export const metadata: Metadata = { title: "Partner" };

/**
 * Elenco provvisorio: in seguito arriva dalla tabella `fornitori` con `pubblicato = true`.
 * Logo e presentazione si mostrano solo dopo autorizzazione scritta del fornitore.
 */
const partner: { nome: string; presentazione?: string; logo?: string }[] = [
  { nome: "Irca" },
  { nome: "Delifrance" },
  { nome: "San Giorgio" },
  { nome: "Debic" },
  { nome: "Rogelfrut" },
  { nome: "Vandemoortele" },
];

export default function Partner() {
  return (
    <Sezione etichetta="Partner" titolo="I marchi che distribuiamo">
      <p className="max-w-2xl text-slate">
        Una selezione dei fornitori con cui lavoriamo ogni giorno. Loghi e presentazioni
        compaiono man mano che riceviamo l’autorizzazione.
      </p>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {partner.map((p) => (
          <li key={p.nome} className="rounded-lg border border-azzurro/40 p-6">
            <div className="flex h-12 items-center">
              {p.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.logo} alt={p.nome} className="max-h-12" />
              ) : (
                <span className="font-serif text-2xl">{p.nome}</span>
              )}
            </div>
            {p.presentazione && <p className="mt-3 text-sm text-slate">{p.presentazione}</p>}
          </li>
        ))}
      </ul>
    </Sezione>
  );
}
