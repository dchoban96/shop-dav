import type { Famiglia, Marchio, Ordinamento } from "@/lib/dati/catalogo";

type Props = {
  q: string;
  famiglia?: number;
  marchio?: number;
  ordina: Ordinamento;
  famiglie: Famiglia[];
  marchi: Marchio[];
};

const select =
  "w-full rounded-md border border-azzurro bg-bianco px-3 py-2.5 text-sm text-navy";

/** Form GET: funziona senza JavaScript e mantiene l'URL condivisibile. */
export function FiltriCatalogo({ q, famiglia, marchio, ordina, famiglie, marchi }: Props) {
  return (
    <form method="get" action="/catalogo" className="grid gap-3 md:grid-cols-[1fr_200px_200px_160px_auto]">
      <div>
        <label htmlFor="q" className="sr-only">
          Cerca per nome o codice
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Cerca per nome o codice"
          className="w-full rounded-md border border-azzurro bg-bianco px-4 py-2.5 text-base"
        />
      </div>
      <div>
        <label htmlFor="famiglia" className="sr-only">
          Famiglia
        </label>
        <select id="famiglia" name="famiglia" defaultValue={famiglia ?? ""} className={select}>
          <option value="">Tutte le famiglie</option>
          {famiglie.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome} ({f.n_articoli})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="marchio" className="sr-only">
          Marchio
        </label>
        <select id="marchio" name="marchio" defaultValue={marchio ?? ""} className={select}>
          <option value="">Tutti i marchi</option>
          {marchi.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nome_breve ?? m.nome_nts} ({m.n_articoli})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="ordina" className="sr-only">
          Ordina
        </label>
        <select id="ordina" name="ordina" defaultValue={ordina} className={select}>
          <option value="nome">Per nome</option>
          <option value="vendite">Più venduti</option>
          <option value="codice">Per codice</option>
        </select>
      </div>
      <button
        type="submit"
        className="rounded-md bg-navy px-5 py-2.5 text-sm font-semibold text-bianco hover:bg-[#0d2144]"
      >
        Cerca
      </button>
    </form>
  );
}
