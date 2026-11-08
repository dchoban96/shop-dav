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

/** Segnaposto foto: fondo ice con il nome della famiglia, mai la foto di un altro prodotto. */
type Formato = "card" | "grande" | "piccola";

const CLASSI_FOTO: Record<Formato, string> = {
  card: "h-20 w-20 shrink-0 sm:h-auto sm:w-full sm:aspect-square",
  grande: "mx-auto aspect-square w-full max-w-xs md:max-w-none",
  piccola: "h-16 w-16 shrink-0",
};

export function FotoArticolo({ articolo, grande = false, formato }: { articolo: Articolo; grande?: boolean; formato?: Formato }) {
  const classi = CLASSI_FOTO[formato ?? (grande ? "grande" : "card")];
  if (articolo.foto_path) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={articolo.foto_path}
        alt={articolo.descrizione_pulita ?? articolo.descrizione_nts}
        className={`${classi} rounded-md object-contain bg-bianco`}
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

export function BadgeDisponibilita({ stato }: { stato: Disponibilita }) {
  const segno = { disponibile: "●", in_esaurimento: "◐", su_ordinazione: "○", non_nota: "–" }[stato];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate">
      <span aria-hidden="true" className="text-azzurro">
        {segno}
      </span>
      {etichettaDisponibilita(stato)}
    </span>
  );
}

export function Prezzo({ valore, className }: { valore: number | null; className?: string }) {
  const testo = formattaPrezzo(valore);
  if (!testo) return <span className={`text-xs text-slate ${className ?? ""}`}>Prezzo da definire</span>;
  return <span className={`prezzo text-lg ${className ?? ""}`}>{testo}</span>;
}

type Props = { articolo: Articolo; stato: Disponibilita; prezzo: number | null };

/** Riga/card articolo: lista su telefono, card in griglia da sm in su. `prezzo` è quello del cliente, mai il listino. */
export function SchedaArticolo({ articolo, stato, prezzo }: Props) {
  const nome = articolo.descrizione_pulita ?? articolo.descrizione_nts;
  return (
    <article className="flex gap-4 rounded-lg border border-azzurro/40 bg-bianco p-3 sm:flex-col sm:p-4">
      <Link href={`/catalogo/${encodeURIComponent(articolo.cod_dav)}`} className="shrink-0 sm:block">
        <FotoArticolo articolo={articolo} />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex h-5 items-center">
          <LogoFornitore nome={nomeMarchio(articolo)} logo={articolo.fornitore?.logo_path} formato="inline" />
        </div>
        <h3 className="font-sans text-sm font-semibold leading-snug text-navy">
          <Link href={`/catalogo/${encodeURIComponent(articolo.cod_dav)}`} className="hover:underline">
            {nome}
          </Link>
        </h3>
        <p className="text-xs text-slate">
          {articolo.cod_dav}
          {articolo.um ? ` · ${articolo.um}` : ""}
          {articolo.pezzi_confezione ? ` · conf. da ${articolo.pezzi_confezione}` : ""}
        </p>
        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          <Prezzo valore={prezzo} />
          <BadgeDisponibilita stato={stato} />
        </div>
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
          <button type="submit" className="h-10 flex-1 rounded-md bg-navy px-3 text-sm font-semibold text-bianco hover:bg-[#0d2144]">
            Aggiungi
          </button>
        </form>
      </div>
    </article>
  );
}
