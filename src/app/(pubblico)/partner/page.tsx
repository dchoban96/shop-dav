import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { LogoFornitore } from "@/components/LogoFornitore";
import { Sezione } from "@/components/Sezione";
import { leggiPartner } from "@/lib/dati/catalogo";

export const metadata: Metadata = { title: "Partner" };

/**
 * Logo e presentazione si mostrano solo per i fornitori con autorizzazione scritta
 * (`fornitori.pubblicato = true`, STRUTTURA sezione 1). Finché nessuno è pubblicato,
 * resta l'elenco provvisorio dei soli nomi.
 */
const provvisori = ["Irca", "Delifrance", "San Giorgio", "Debic", "Rogelfrut", "Vandemoortele"];

async function Elenco() {
  await connection();
  const partner = await leggiPartner();

  if (partner.length === 0) {
    return (
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {provvisori.map((nome) => (
          <li key={nome} className="rounded-lg border border-azzurro/40 p-6">
            <span className="font-serif text-2xl">{nome}</span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul className="mt-8 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
      {partner.map((p) => {
        const nome = p.nome_breve ?? p.nome_nts;
        return (
          <li key={p.id} className="group flex flex-col overflow-hidden rounded-lg border border-azzurro/40 bg-bianco">
            <LogoFornitore nome={nome} logo={p.logo_path} formato="tile" mono />
            <div className="border-t border-ice p-5">
              <h3 className="text-xl">{nome}</h3>
              {p.presentazione && <p className="mt-2 text-sm leading-relaxed text-slate">{p.presentazione}</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default function Partner() {
  return (
    <Sezione etichetta="Partner" titolo="I marchi che distribuiamo">
      <p className="max-w-2xl text-slate">
        Una selezione dei fornitori con cui lavoriamo ogni giorno. Loghi e presentazioni
        compaiono man mano che riceviamo l’autorizzazione.
      </p>
      <Suspense fallback={<p className="mt-8 text-sm text-slate">Carico i partner…</p>}>
        <Elenco />
      </Suspense>
    </Sezione>
  );
}
