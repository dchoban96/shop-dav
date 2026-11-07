import Link from "next/link";
import { Emblema } from "@/components/Logo";
import { BottoneLink } from "@/components/Bottone";
import { Sezione } from "@/components/Sezione";
import { azienda } from "@/lib/azienda";

const categorie = [
  { nome: "Secco", testo: "Farine, zuccheri, semilavorati, decorazioni e packaging." },
  { nome: "Fresco", testo: "Latticini, burro, panna, uova e salumi con consegna rapida." },
  { nome: "Surgelato", testo: "Viennoiserie, pane, frutta e preparati pronti da cuocere." },
];

const passi = [
  {
    n: "1",
    titolo: "Invito",
    testo: "L’ufficio DAV ti invia un invito via email. Nessuna registrazione libera.",
  },
  {
    n: "2",
    titolo: "Riordina",
    testo: "Trovi i tuoi articoli abituali con le quantità già pronte. Modifichi e confermi.",
  },
  {
    n: "3",
    titolo: "Consegna",
    testo: "L’ufficio conferma l’ordine e lo consegna con mezzi propri nei tuoi giorni.",
  },
];

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="bg-bianco">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-[1fr_auto] md:py-24">
          <div>
            <p className="etichetta">{azienda.nomeEsteso}</p>
            <h1 className="mt-3 max-w-2xl text-4xl leading-tight md:text-5xl">
              Secco, fresco e surgelato per chi lavora in laboratorio, ogni giorno.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-slate">
              Dal 1997 forniamo pasticcerie, panifici, pizzerie e ristoranti della Valtellina
              con {azienda.prodottiAStock} prodotti a stock e consegna con mezzi propri.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <BottoneLink href="/accedi">Area clienti</BottoneLink>
              <BottoneLink href="/chi-siamo" variante="secondario">
                Chi siamo
              </BottoneLink>
            </div>
          </div>
          <Emblema size={180} className="hidden md:block" />
        </div>
      </section>

      {/* Categorie */}
      <Sezione etichetta="Cosa distribuiamo" titolo="Tre temperature, un solo fornitore" sfondo="ice">
        <div className="grid gap-4 md:grid-cols-3">
          {categorie.map((c) => (
            <article key={c.nome} className="rounded-lg border border-azzurro/40 bg-bianco p-6">
              <h3 className="text-2xl">{c.nome}</h3>
              <p className="mt-2 text-sm text-slate">{c.testo}</p>
            </article>
          ))}
        </div>
      </Sezione>

      {/* Marchi */}
      <Sezione etichetta="I marchi" titolo="Distributore esclusivo Irca Group in Valtellina">
        <p className="max-w-2xl text-slate">
          Lavoriamo con i principali marchi della pasticceria e della panificazione professionale.
          I loghi compaiono qui man mano che riceviamo l’autorizzazione dei fornitori.
        </p>
        <p className="mt-4">
          <Link href="/partner" className="font-semibold underline underline-offset-4">
            Vedi i partner
          </Link>
        </p>
      </Sezione>

      {/* Come funziona */}
      <Sezione etichetta="Area clienti" titolo="Riordinare è più veloce di una telefonata" sfondo="ice">
        <ol className="grid gap-4 md:grid-cols-3">
          {passi.map((p) => (
            <li key={p.n} className="rounded-lg bg-bianco p-6">
              <span className="font-serif text-3xl text-azzurro">{p.n}</span>
              <h3 className="mt-2 text-xl">{p.titolo}</h3>
              <p className="mt-2 text-sm text-slate">{p.testo}</p>
            </li>
          ))}
        </ol>
        <div className="mt-8">
          <BottoneLink href="/accedi">Area clienti</BottoneLink>
        </div>
      </Sezione>

      {/* Contatti */}
      <Sezione etichetta="Contatti" titolo="Parliamo di persona">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="text-slate">
            <p>
              {azienda.ragioneSociale}, {azienda.sede}.
            </p>
            <p className="mt-1">{azienda.zona}.</p>
          </div>
          <div className="space-y-2">
            <p>
              <span className="etichetta mr-2">Email</span>
              <a href={`mailto:${azienda.email}`} className="underline underline-offset-2">
                {azienda.email}
              </a>
            </p>
            {azienda.telefonoOrdini && (
              <p>
                <span className="etichetta mr-2">Ordini</span>
                <a href={`tel:${azienda.telefonoOrdini}`} className="underline underline-offset-2">
                  {azienda.telefonoOrdini}
                </a>
              </p>
            )}
          </div>
        </div>
      </Sezione>
    </>
  );
}
