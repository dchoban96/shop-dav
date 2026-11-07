import Link from "next/link";
import {
  type Articolo,
  type Disponibilita,
  etichettaDisponibilita,
  formattaPrezzo,
  nomeMarchio,
} from "@/lib/dati/catalogo";

/** Segnaposto foto: fondo ice con il nome della famiglia, mai la foto di un altro prodotto. */
export function FotoArticolo({ articolo, grande = false }: { articolo: Articolo; grande?: boolean }) {
  if (articolo.foto_path) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={articolo.foto_path}
        alt={articolo.descrizione_pulita ?? articolo.descrizione_nts}
        className={`${grande ? "mx-auto aspect-square w-full max-w-xs md:max-w-none" : "h-20 w-20 shrink-0 sm:h-auto sm:w-full sm:aspect-square"} rounded-md object-contain bg-bianco`}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      className={`${grande ? "mx-auto aspect-square w-full max-w-xs md:max-w-none" : "h-20 w-20 shrink-0 sm:h-auto sm:w-full sm:aspect-square"} flex items-center justify-center rounded-md bg-ice p-2 text-center font-serif text-xs leading-tight text-slate`}
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

type Props = { articolo: Articolo; stato: Disponibilita };

/** Riga/card articolo: lista su telefono, card in griglia da sm in su. */
export function SchedaArticolo({ articolo, stato }: Props) {
  const nome = articolo.descrizione_pulita ?? articolo.descrizione_nts;
  return (
    <article className="flex gap-4 rounded-lg border border-azzurro/40 bg-bianco p-3 sm:flex-col sm:p-4">
      <Link href={`/catalogo/${encodeURIComponent(articolo.cod_dav)}`} className="shrink-0 sm:block">
        <FotoArticolo articolo={articolo} />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="etichetta truncate">{nomeMarchio(articolo)}</p>
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
          <Prezzo valore={articolo.prezzo_listino} />
          <BadgeDisponibilita stato={stato} />
        </div>
      </div>
    </article>
  );
}
