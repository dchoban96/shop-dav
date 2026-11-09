import { MINUTI_SYNC_FERMA, statoSync } from "@/lib/dati/documenti";
import { numero } from "@/components/documenti/formato";

const NOMI: Record<string, string> = {
  documenti_15min: "Documenti (ogni 15 minuti)",
  documenti_notte: "Ripasso notturno 24 mesi",
  scadenze: "Scadenze",
};

const quando = (iso: string) =>
  new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" }).format(new Date(iso));

/**
 * Cruscotto ufficio: stato della sincronizzazione di documenti e scadenze da NTS (tabella sync_stato,
 * scritta dal connettore a ogni giro). Ferma da più di un'ora (il ripasso notturno: 26 ore) → riquadro in evidenza.
 */
export async function PannelloSync() {
  const s = await statoSync();
  if (!s.disponibile) {
    return (
      <section className="mb-10 rounded-lg border border-azzurro/40 p-4 text-sm">
        <p className="font-semibold">Documenti e scadenze da NTS: non ancora attivi</p>
        <p className="mt-1 text-slate">Migrazione 0009 da applicare, poi il giro di sincronizzazione del connettore.</p>
      </section>
    );
  }
  const ferma = s.lavori.length > 0 && s.lavori.some((l) => l.ferma);
  return (
    <section className={`mb-10 rounded-lg border p-4 text-sm ${ferma ? "border-rosso bg-rosso text-bianco" : "border-azzurro/40"}`} role={ferma ? "alert" : undefined}>
      <p className="font-semibold">
        {s.lavori.length === 0
          ? "Documenti e scadenze da NTS: sincronizzazione mai avviata"
          : ferma
            ? `Sincronizzazione documenti ferma: nessun giro riuscito negli ultimi ${MINUTI_SYNC_FERMA} minuti (ripasso notturno: 26 ore)`
            : "Sincronizzazione documenti attiva"}
      </p>
      <p className={`mt-1 ${ferma ? "" : "text-slate"}`}>
        {numero(s.documenti)} documenti · {numero(s.scadenzeAperte)} scadenze aperte
      </p>
      {s.lavori.length > 0 && (
        <ul className={`mt-2 space-y-0.5 ${ferma ? "" : "text-slate"}`}>
          {s.lavori.map((l) => (
            <li key={l.lavoro}>
              <span className="font-semibold">{NOMI[l.lavoro] ?? l.lavoro}</span>: {l.ultimo_ok ? `ultimo giro riuscito ${quando(l.ultimo_ok)}` : "mai riuscito"}
              {l.righe !== null ? ` · ${l.righe} righe` : ""}
              {l.ultimo_errore && l.errore_il && (!l.ultimo_ok || l.errore_il > l.ultimo_ok) ? ` · errore ${quando(l.errore_il)}: ${l.ultimo_errore}` : ""}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
