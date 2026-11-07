import type { Metadata } from "next";
import { Sezione } from "@/components/Sezione";
import { azienda } from "@/lib/azienda";

export const metadata: Metadata = { title: "Policy" };

/** Testi definitivi forniti da DAV / consulente. Qui solo la struttura delle sezioni. */
const sezioni = [
  { id: "privacy", titolo: "Informativa privacy" },
  { id: "cookie", titolo: "Informativa cookie" },
  { id: "condizioni", titolo: "Condizioni di vendita B2B" },
  { id: "consegne", titolo: "Consegne e resi" },
];

export default function Policy() {
  return (
    <Sezione etichetta="Policy" titolo="Informative e condizioni">
      <nav aria-label="Sezioni" className="flex flex-wrap gap-4 text-sm font-semibold">
        {sezioni.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="underline underline-offset-4">
            {s.titolo}
          </a>
        ))}
      </nav>
      <div className="mt-10 space-y-12">
        {sezioni.map((s) => (
          <article key={s.id} id={s.id} className="scroll-mt-24">
            <h3 className="text-2xl">{s.titolo}</h3>
            <p className="mt-3 max-w-2xl text-slate">
              Testo in preparazione. Per informazioni scrivere a{" "}
              <a href={`mailto:${azienda.email}`} className="underline underline-offset-2">
                {azienda.email}
              </a>
              .
            </p>
          </article>
        ))}
      </div>
    </Sezione>
  );
}
