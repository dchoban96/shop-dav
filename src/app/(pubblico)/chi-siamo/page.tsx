import type { Metadata } from "next";
import { Sezione } from "@/components/Sezione";
import { azienda } from "@/lib/azienda";

export const metadata: Metadata = { title: "Chi siamo" };

const numeri = [
  { valore: "1997", testo: "anno di fondazione, a Sondrio" },
  { valore: azienda.prodottiAStock, testo: "prodotti a stock" },
  { valore: "24 h", testo: "consegna spesso entro un giorno" },
  { valore: "3", testo: "temperature: secco, fresco, surgelato" },
];

export default function ChiSiamo() {
  return (
    <>
      <Sezione etichetta="Chi siamo" titolo={azienda.nomeEsteso}>
        <div className="grid gap-10 md:grid-cols-[2fr_1fr]">
          <div className="space-y-4 text-lg leading-relaxed">
            <p>
              {azienda.ragioneSociale} nasce il {azienda.fondazione} a Sondrio e oggi ha sede a{" "}
              {azienda.sede}. Distribuiamo prodotti per pasticceria, panificazione, pizzeria e
              ristorazione.
            </p>
            <p>
              Siamo distributore esclusivo Irca Group in Valtellina e l’unica realtà della zona che
              gestisce insieme secco, fresco e surgelato, con circa 5.000 prodotti a stock.
            </p>
            <p>
              Consegniamo con mezzi propri, spesso entro 24 ore, in {azienda.zona.toLowerCase()}.
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-4 self-start md:grid-cols-1">
            {numeri.map((n) => (
              <div key={n.testo} className="rounded-lg bg-ice p-5">
                <dt className="font-serif text-3xl">{n.valore}</dt>
                <dd className="mt-1 text-sm text-slate">{n.testo}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Sezione>
    </>
  );
}
