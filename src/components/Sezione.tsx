import type { ReactNode } from "react";

type Props = {
  etichetta?: string;
  titolo: string;
  children: ReactNode;
  sfondo?: "bianco" | "ice";
  id?: string;
};

/** Sezione di pagina pubblica: etichetta piccola, titolo in Baskerville, contenuto. */
export function Sezione({ etichetta, titolo, children, sfondo = "bianco", id }: Props) {
  return (
    <section id={id} className={sfondo === "ice" ? "bg-ice" : "bg-bianco"}>
      <div className="mx-auto max-w-6xl px-4 py-14 md:py-20">
        {etichetta && <p className="etichetta">{etichetta}</p>}
        <h2 className="mt-2 text-3xl md:text-4xl">{titolo}</h2>
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}
