import { BadgeNts } from "@/components/admin/StatoNts";
import { CopiaTesto } from "@/components/admin/CopiaTesto";
import { logNts } from "@/lib/dati/nts";
import { formattaData, type Ordine } from "@/lib/dati/ordini";
import { reinviaNts, segnaManualeNts } from "@/app/(admin)/admin/azioni";

const MESSAGGI: Record<string, string> = {
  reinviato: "Ordine rimesso in coda: il connettore lo riprende al prossimo giro.",
  manuale: "Ordine segnato come inserito a mano: il connettore non lo tocca più.",
  invariato: "Nessun cambiamento: lo stato dell'ordine è cambiato nel frattempo. Ricarica la pagina.",
  conferma: "Per reinviare spunta la conferma.",
  nota: "Per segnarlo inserito a mano scrivi una nota (chi, quando, numero NTS).",
};

const ora = (iso: string | null) => (iso ? formattaData(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—");

/** Dettaglio ordine, area ufficio: stato verso NTS, log del connettore e azioni manuali. */
export async function SezioneNts({ ordine, messaggio }: { ordine: Ordine; messaggio?: string }) {
  if (!ordine.stato_nts && !ordine.riferimento_nts) return null;
  const log = await logNts(ordine.id);
  const stato = ordine.stato_nts;
  const puoReinviare = stato === "errore" && ordine.id_frontiera === null;
  const puoManuale = stato === "errore" || stato === "da_verificare" || stato === "da_inviare";
  const campo = "rounded-md border border-azzurro bg-bianco px-3 py-2 text-sm";

  return (
    <section className={`mt-6 rounded-lg border p-5 ${stato === "errore" || stato === "da_verificare" ? "border-rosso" : "border-azzurro/40"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl">Gestionale NTS</h2>
        <BadgeNts stato={stato} />
      </div>

      {messaggio && MESSAGGI[messaggio] && (
        <p role="status" className="mt-3 rounded-md bg-ice px-3 py-2 text-sm">
          {MESSAGGI[messaggio]}
        </p>
      )}

      {ordine.errore_nts && (
        <p className="mt-3 rounded-md border border-rosso px-3 py-2 text-sm text-rosso">
          <strong>{stato === "da_verificare" ? "Da verificare" : "Errore"}:</strong> {ordine.errore_nts}
        </p>
      )}

      <dl className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-[180px_1fr]">
        <dt className="text-slate">Riferimento</dt>
        <dd className="flex flex-wrap items-center gap-3">
          <span className="font-mono font-semibold">{ordine.riferimento_nts ?? "—"}</span>
          {ordine.riferimento_nts && <CopiaTesto testo={ordine.riferimento_nts} etichetta="Copia riferimento" />}
        </dd>
        <dt className="text-slate">Numero NTS</dt>
        <dd>{ordine.numero_nts ?? "—"} <span className="text-xs text-slate">(informativo: NTS riusa i numeri, cercare per riferimento)</span></dd>
        <dt className="text-slate">ID frontiera</dt>
        <dd>{ordine.id_frontiera ?? "—"}</dd>
        <dt className="text-slate">Tentativi</dt>
        <dd>{ordine.tentativi_nts}</dd>
        <dt className="text-slate">Preso dal connettore</dt>
        <dd>{ora(ordine.in_invio_il)}</dd>
        <dt className="text-slate">Scritto in frontiera</dt>
        <dd>{ora(ordine.in_frontiera_il)}</dd>
        <dt className="text-slate">Entrato in NTS</dt>
        <dd>{ora(ordine.in_nts_il)}</dd>
      </dl>

      {stato === null && <p className="mt-3 text-sm text-slate">Ordine di un cliente demo o precedente all’invio automatico: non va in NTS.</p>}

      {(puoReinviare || puoManuale) && (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {puoReinviare && (
            <form action={reinviaNts} className="rounded-md bg-ice p-4">
              <input type="hidden" name="ordine" value={ordine.id} />
              <p className="text-sm font-semibold">Reinvia a NTS</p>
              <p className="mt-1 text-xs text-slate">Dopo aver corretto la causa dell’errore (articolo, cliente, prezzo). Il connettore controlla comunque il riferimento in frontiera: niente doppioni.</p>
              <label className="mt-3 flex items-start gap-2 text-sm">
                <input type="checkbox" name="conferma" value="si" required className="mt-1" />
                Ho verificato in NTS che l’ordine {ordine.riferimento_nts} non c’è già.
              </label>
              <button type="submit" className="mt-3 rounded-md bg-navy px-4 py-2 text-sm font-semibold text-bianco hover:bg-[#0d2144]">
                Reinvia
              </button>
            </form>
          )}
          {puoManuale && (
            <form action={segnaManualeNts} className="rounded-md bg-ice p-4">
              <input type="hidden" name="ordine" value={ordine.id} />
              <p className="text-sm font-semibold">Segna inserito a mano</p>
              <p className="mt-1 text-xs text-slate">Se l’ordine è stato inserito (o trovato) in NTS dall’ufficio. Il connettore non lo tocca più.</p>
              <label className="sr-only" htmlFor="nota-nts">
                Nota
              </label>
              <textarea id="nota-nts" name="nota" required minLength={3} maxLength={500} rows={2} placeholder="Es. inserito da Anna, n. NTS 1234" className={`${campo} mt-3 w-full`} />
              <button type="submit" className="mt-2 rounded-md border border-navy px-4 py-2 text-sm font-semibold text-navy hover:bg-bianco">
                Segna inserito a mano
              </button>
            </form>
          )}
        </div>
      )}
      {stato === "errore" && ordine.id_frontiera !== null && (
        <p className="mt-3 text-xs text-slate">
          Questo ordine è arrivato in frontiera e NTS l’ha scartato: il reinvio automatico non è possibile. Verificare in NTS e inserirlo a mano.
        </p>
      )}

      <details className="mt-5" open={stato === "errore" || stato === "da_verificare"}>
        <summary className="cursor-pointer text-sm font-semibold">Registro ({log.length})</summary>
        {log.length === 0 ? (
          <p className="mt-2 text-sm text-slate">Nessun passaggio registrato.</p>
        ) : (
          <table className="mt-2 w-full text-sm">
            <tbody>
              {log.map((l) => (
                <tr key={l.id} className="border-b border-ice align-top">
                  <td className="whitespace-nowrap py-1.5 pr-3 text-slate">{ora(l.quando)}</td>
                  <td className="whitespace-nowrap py-1.5 pr-3 font-semibold">{l.evento}</td>
                  <td className="py-1.5">{l.dettaglio ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </details>
    </section>
  );
}
