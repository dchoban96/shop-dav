import Link from "next/link";
import { type DocumentoBreve, type Scadenza, titoloDocumento } from "@/lib/dati/documenti";
import { EtichettaScadenza } from "./Etichetta";
import { dataCorta, euro } from "./formato";

type Props = {
  scadenze: Scadenza[];
  /** Link al documento della scadenza (null = colonna documento nascosta, es. dentro la fattura stessa). */
  href?: ((d: DocumentoBreve) => string) | null;
  /** Mostra l'importo residuo (scadenze aperte); per le pagate basta l'importo. */
  residuo?: boolean;
};

/** Scadenze come righe: data, documento, importo, residuo, stato. Su telefono documento e residuo vanno sotto la data. */
export function ElencoScadenze({ scadenze, href = null, residuo = true }: Props) {
  return (
    <ul className="divide-y divide-azzurro/40 rounded-lg border border-azzurro/40 bg-bianco">
      {scadenze.map((s) => {
        const parziale = residuo && s.stato !== "pagata" && Math.abs(s.residuo - s.importo) >= 0.005;
        return (
          <li key={s.id} className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <p className="font-semibold">{dataCorta(s.data_scadenza)}</p>
              <p className="text-sm text-slate">
                {s.documento && href ? (
                  <Link href={href(s.documento)} className="underline underline-offset-2 hover:text-navy">
                    {titoloDocumento({ ...s.documento, sottotipo: null, serie: "" })} del {dataCorta(s.documento.data_doc)}
                  </Link>
                ) : s.documento ? null : href ? (
                  "Scadenza senza documento collegato"
                ) : null}
                {s.tipo_pagamento && <span className="block text-xs">{s.tipo_pagamento}</span>}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1 text-right">
              <p className="prezzo">{euro(residuo && s.stato !== "pagata" ? s.residuo : s.importo)}</p>
              {parziale && <p className="text-xs text-slate">su {euro(s.importo)}</p>}
              <EtichettaScadenza s={s} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
