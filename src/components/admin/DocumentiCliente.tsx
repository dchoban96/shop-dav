import Link from "next/link";
import { ElencoScadenze } from "@/components/documenti/ElencoScadenze";
import { Etichetta } from "@/components/documenti/Etichetta";
import { dataCorta, euro, hrefDocumentoAdmin } from "@/components/documenti/formato";
import { situazionePagamenti, titoloDocumento, ultimiDocumenti } from "@/lib/dati/documenti";

/** Scheda cliente dell'ufficio: ultimi documenti NTS (anche quelli spariti da NTS) e scadenze aperte. */
export async function DocumentiCliente({ clienteId }: { clienteId: number }) {
  const [doc, pag] = await Promise.all([ultimiDocumenti(clienteId, 20), situazionePagamenti(clienteId)]);
  if (!doc.disponibile) {
    return (
      <section className="mt-8">
        <h2 className="text-2xl">Documenti e scadenze</h2>
        <p className="mt-3 rounded-md bg-ice px-4 py-6 text-center text-sm text-slate">Non ancora attivi: migrazione 0009 da applicare e sincronizzazione del connettore da avviare.</p>
      </section>
    );
  }
  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-2">
      <section>
        <h2 className="text-2xl">Ultimi documenti</h2>
        {doc.documenti.length === 0 ? (
          <p className="mt-3 text-sm text-slate">Nessun documento sincronizzato.</p>
        ) : (
          <ul className="mt-3 divide-y divide-ice rounded-lg border border-azzurro/40">
            {doc.documenti.map((d) => (
              <li key={d.id}>
                <Link href={hrefDocumentoAdmin(d)} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-ice">
                  <span>
                    <span className="font-semibold">{titoloDocumento(d)}</span> <span className="text-slate">{dataCorta(d.data_doc)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {!d.presente_in_nts && <Etichetta tono="forte">Non più in NTS</Etichetta>}
                    {euro(d.totale)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="text-2xl">Scadenze aperte</h2>
        <p className="mt-1 text-sm text-slate">
          Da pagare {euro(pag.totaleDaPagare)} · di cui scaduto {euro(pag.totaleScaduto)} · {pag.pagamento.descrizione ?? "pagamento non indicato"}
        </p>
        {pag.aperte.length === 0 ? (
          <p className="mt-3 text-sm text-slate">Nessuna scadenza aperta.</p>
        ) : (
          <div className="mt-3">
            <ElencoScadenze scadenze={pag.aperte} href={hrefDocumentoAdmin} />
          </div>
        )}
        <p className="mt-2 text-xs text-slate">Solo informazione: nessun blocco automatico sugli ordini (decisione del 09/11).</p>
      </section>
    </div>
  );
}
