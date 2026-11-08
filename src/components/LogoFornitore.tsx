/* eslint-disable @next/next/no-img-element */

/**
 * L'unica scatola per i loghi fornitore (STRUTTURA, sezione 9: `LogoFornitore`).
 * Il logo (`fornitori.logo_path`, bucket pubblico `catalogo/loghi/`) sta in una scatola a
 * proporzione fissa con `object-contain`, così loghi larghi (Delifrance 4,4:1) e quadrati
 * (Irca, Caseificio Moro) hanno la stessa misura ottica ovunque. Senza logo, la scatola mostra
 * il nome breve in Baskerville: la colonna non resta mai vuota.
 *
 * Formati:
 * - `tile`     griglia marchi (home, partner, landing): 2:1, larghezza del contenitore
 * - `riga`     colonna fissa a inizio riga (storico, carrello, ordine): 88 × 44 px
 * - `compatto` celle di tabella e spazi stretti: 64 × 32 px
 * - `inline`   al posto dell'etichetta marchio nelle schede articolo: alto 20 px
 */
type Formato = "tile" | "riga" | "compatto" | "inline";

type Props = {
  nome: string;
  logo?: string | null;
  formato?: Formato;
  /** Grigio con colore al passaggio (pagine pubbliche); l'elemento padre deve avere `group`. */
  mono?: boolean;
  className?: string;
};

const SCATOLA: Record<Formato, string> = {
  tile: "aspect-[2/1] w-full min-h-0 overflow-hidden p-[12%]",
  riga: "h-11 w-22 shrink-0 rounded-md border border-ice p-1.5",
  compatto: "h-8 w-16 shrink-0 rounded border border-ice p-1",
  inline: "h-5 w-auto max-w-20",
};

const TESTO: Record<Formato, string> = {
  tile: "font-serif text-lg md:text-xl",
  riga: "font-serif text-[11px] leading-tight",
  compatto: "font-serif text-[10px] leading-tight",
  inline: "etichetta truncate",
};

export function LogoFornitore({ nome, logo, formato = "riga", mono = false, className }: Props) {
  const inline = formato === "inline";
  // Nessun marchio (fornitore assente o tolto dal sito): scatola vuota, così la colonna resta allineata.
  if (!logo && !nome.trim()) {
    return inline ? null : <span aria-hidden="true" className={`bg-bianco ${SCATOLA[formato]} ${className ?? ""}`} />;
  }
  if (!logo) {
    if (inline) return <span className={`${TESTO.inline} ${className ?? ""}`}>{nome}</span>;
    return (
      <span
        aria-label={nome}
        className={`flex items-center justify-center overflow-hidden bg-bianco text-center text-navy ${SCATOLA[formato]} ${TESTO[formato]} ${className ?? ""}`}
      >
        <span className="line-clamp-2">{nome}</span>
      </span>
    );
  }
  const filtro = mono ? "grayscale transition group-hover:grayscale-0 motion-reduce:transition-none" : "";
  if (inline) {
    return <img src={logo} alt={nome} className={`${SCATOLA.inline} object-contain object-left ${filtro} ${className ?? ""}`} />;
  }
  return (
    <span className={`flex items-center justify-center bg-bianco ${SCATOLA[formato]} ${className ?? ""}`}>
      <img src={logo} alt={nome} className={`h-full w-full object-contain ${filtro}`} />
    </span>
  );
}
