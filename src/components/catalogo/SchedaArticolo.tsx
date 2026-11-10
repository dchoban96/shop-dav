import Link from "next/link";
import { aggiungi } from "@/app/(cliente)/azioni";
import {
  type Articolo,
  type Disponibilita,
  etichettaDisponibilita,
  formattaPrezzo,
  nomeMarchio,
} from "@/lib/dati/catalogo";
import { LogoFornitore } from "@/components/LogoFornitore";
import { IconaAggiorna, IconaAvviso, IconaCarrello, IconaOrologio, IconaVerifica } from "@/components/Icone";

/** Segnaposto foto: fondo ice con il nome della famiglia, mai la foto di un altro prodotto. */
type Formato = "card" | "grande" | "piccola";

const CLASSI_FOTO: Record<Formato, string> = {
  card: "h-20 w-20 shrink-0 sm:h-auto sm:w-full sm:aspect-square",
  grande: "mx-auto aspect-square w-full max-w-xs md:max-w-none",
  piccola: "h-16 w-16 shrink-0",
};

export function FotoArticolo({ articolo, grande = false, formato }: { articolo: Articolo; grande?: boolean; formato?: Formato }) {
  const f = formato ?? (grande ? "grande" : "card");
  const classi = CLASSI_FOTO[f];
  if (articolo.foto_path) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={articolo.foto_path}
        alt={articolo.descrizione_pulita ?? articolo.descrizione_nts}
        // Nelle card e nelle righe la foto riempie il riquadro; nella scheda si vede intera.
        className={`${classi} rounded-md bg-bianco ${f === "grande" ? "object-contain" : "object-cover"}`}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      className={`${classi} flex items-center justify-center rounded-md bg-ice p-1 text-center font-serif text-[10px] leading-tight text-slate`}
    >
      {articolo.famiglia?.nome ?? "Articolo"}
    </div>
  );
}

/** Etichette di disponibilità come i chip Leany: fondo tenue, testo scuro, icona. */
const STILE_DISPONIBILITA = {
  disponibile: { classi: "bg-verde-tenue text-verde-scuro", Icona: IconaVerifica },
  in_esaurimento: { classi: "bg-rosso-tenue text-rosso", Icona: IconaAvviso },
  su_ordinazione: { classi: "bg-blu-tenue text-blu-scuro", Icona: IconaOrologio },
  non_nota: { classi: "bg-ice text-slate", Icona: IconaAggiorna },
} as const;

export function BadgeDisponibilita({ stato }: { stato: Disponibilita }) {
  const { classi, Icona } = STILE_DISPONIBILITA[stato];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${classi}`}>
      <Icona width={14} height={14} />
      {etichettaDisponibilita(stato)}
    </span>
  );
}

export function Prezzo({ valore, className }: { valore: number | null; className?: string }) {
  const testo = formattaPrezzo(valore);
  if (!testo) return <span className={`text-xs text-slate ${className ?? ""}`}>Prezzo da definire</span>;
  return <span className={`prezzo text-lg ${className ?? ""}`}>{testo}</span>;
}

type Props = { articolo: Articolo; stato: Disponibilita; prezzo: number | null; nota?: string | null };

/** Riga/card articolo: lista su telefono, card in griglia da sm in su. `prezzo` è quello del cliente, mai il listino. */
export function SchedaArticolo({ articolo, stato, prezzo, nota }: Props) {
  const nome = articolo.descrizione_pulita ?? articolo.descrizione_nts;
  return (
    // h-full: la card riempie la cella della griglia, così tutte le card di una riga hanno la stessa altezza
    <article className="flex h-full gap-4 rounded-lg border border-azzurro/40 bg-bianco p-3 sm:flex-col sm:p-4">
      <Link href={`/catalogo/${encodeURIComponent(articolo.cod_dav)}`} className="shrink-0 sm:block">
        <FotoArticolo articolo={articolo} />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex h-5 items-center">
          <LogoFornitore nome={nomeMarchio(articolo)} logo={articolo.fornitore?.logo_path} formato="inline" />
        </div>
        {/* In griglia il titolo occupa sempre tre righe: prezzo e tasti restano alla stessa altezza in tutte le card */}
        <h3 className="font-sans text-sm font-semibold leading-snug text-navy sm:min-h-[4.125em]">
          <Link href={`/catalogo/${encodeURIComponent(articolo.cod_dav)}`} className="hover:underline">
            {nome}
          </Link>
        </h3>
        <p className="text-xs text-slate">
          {articolo.cod_dav}
          {articolo.um ? ` · ${articolo.um}` : ""}
          {articolo.pezzi_confezione ? ` · conf. da ${articolo.pezzi_confezione}` : ""}
        </p>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-2 gap-y-1 pt-1">
          <Prezzo valore={prezzo} />
          <BadgeDisponibilita stato={stato} />
        </div>
        {nota && <p className="text-xs text-slate">{nota}</p>}
        <form action={aggiungi} className="mt-2 flex items-center gap-2">
          <input type="hidden" name="cod_dav" value={articolo.cod_dav} />
          <label htmlFor={`qta-${articolo.cod_dav}`} className="sr-only">
            Quantità
          </label>
          <input
            id={`qta-${articolo.cod_dav}`}
            name="qta"
            type="number"
            min={1}
            step={1}
            defaultValue={1}
            inputMode="numeric"
            className="h-10 w-16 rounded-md border border-azzurro bg-bianco text-center text-base"
          />
          <button type="submit" className="flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-viola px-3 text-sm font-semibold text-bianco transition-colors hover:bg-viola-scuro">
            <IconaCarrello />
            Aggiungi
          </button>
        </form>
      </div>
    </article>
  );
}
