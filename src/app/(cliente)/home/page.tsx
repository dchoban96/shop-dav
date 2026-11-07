import type { Metadata } from "next";

export const metadata: Metadata = { title: "Home" };

/**
 * Home del cliente (STRUTTURA, sezione 1): quattro sezioni in quest'ordine.
 * Per ora solo lo scheletro: i contenuti arrivano con database e import.
 */
const sezioni = [
  {
    titolo: "I tuoi articoli",
    testo: "Gli articoli che ordini di solito, con le quantità dell’ultimo ordine già pronte.",
  },
  {
    titolo: "Consigliati per te",
    testo: "Articoli che ordinavi e non prendi da un po’, e i più richiesti nella tua categoria.",
  },
  {
    titolo: "In evidenza",
    testo: "Le proposte dell’ufficio DAV di questo periodo.",
  },
  {
    titolo: "Catalogo",
    testo: "Tutti i prodotti per famiglia e per marchio, con la ricerca per nome o codice.",
  },
];

export default function HomeCliente() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <label htmlFor="ricerca" className="sr-only">
        Cerca un articolo
      </label>
      <input
        id="ricerca"
        type="search"
        placeholder="Cerca per nome o codice"
        disabled
        className="w-full rounded-md border border-azzurro bg-bianco px-4 py-3 text-base"
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {sezioni.map((s) => (
            <section key={s.titolo} className="rounded-lg border border-azzurro/40 p-6">
              <h2 className="text-2xl">{s.titolo}</h2>
              <p className="mt-2 text-sm text-slate">{s.testo}</p>
              <p className="mt-4 rounded-md bg-ice px-4 py-3 text-sm text-slate">
                In arrivo con il caricamento dei dati.
              </p>
            </section>
          ))}
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-24 rounded-lg border border-azzurro/40 p-5">
            <p className="etichetta">I tuoi acquisti</p>
            <h2 className="mt-1 text-xl">Ultimi 12 mesi</h2>
            <p className="mt-4 text-sm text-slate">
              Qui compariranno fatturato, ripartizione per marchio o famiglia, ultimo ordine
              e statistiche per articolo.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
