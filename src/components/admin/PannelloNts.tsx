import Link from "next/link";
import { BadgeNts } from "@/components/admin/StatoNts";
import { elencoOrdini } from "@/lib/dati/admin";
import { leggiConnettore, MINUTI_SILENZIO } from "@/lib/dati/nts";
import { formattaData } from "@/lib/dati/ordini";

const quando = (iso: string) => formattaData(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });

/**
 * Cruscotto ufficio: stato del connettore NTS (heartbeat) e ordini da controllare.
 * Se il connettore tace da più di MINUTI_SILENZIO minuti il riquadro diventa rosso.
 * L'email all'ufficio la manda il job pg_cron in Supabase (migrazione 0008), non questa pagina.
 */
export async function PannelloNts() {
  const [conn, daControllare] = await Promise.all([leggiConnettore(), elencoOrdini({ nts: "da_controllare" }).catch(() => null)]);
  const s = conn.stato;
  const allarme = conn.fermo || (s !== null && !s.sql_ok);

  return (
    <section className="mb-10">
      <div className={`rounded-lg border p-4 text-sm ${allarme ? "border-rosso bg-rosso text-bianco" : "border-azzurro/40"}`} role={allarme ? "alert" : undefined}>
        <p className="font-semibold">
          {!s
            ? "Connettore NTS: mai avviato"
            : conn.fermo
              ? `Connettore NTS fermo: nessun segnale da ${conn.minuti} minuti`
              : !s.sql_ok
                ? "Connettore NTS attivo, ma SQL Server non risponde"
                : "Connettore NTS attivo"}
        </p>
        {s ? (
          <p className={`mt-1 ${allarme ? "" : "text-slate"}`}>
            Ultimo giro {quando(s.ultimo_giro)} · modalità <strong>{s.modalita}</strong>
            {s.clienti_abilitati ? ` · solo clienti ${s.clienti_abilitati}` : " · tutti i clienti"}
            {s.clienti_da === "shop" ? " (da Impostazioni)" : s.clienti_da === ".env" ? " (dal file .env)" : ""}
            {s.ultimo_errore ? ` · ${s.ultimo_errore}` : ""}
          </p>
        ) : (
          <p className="mt-1 text-slate">Gli ordini confermati restano in coda finché il connettore in LAN non parte.</p>
        )}
        {conn.fermo && (
          <p className="mt-1">
            Oltre {MINUTI_SILENZIO} minuti di silenzio: controllare la macchina del connettore.
          </p>
        )}
        {conn.avviso && (
          <p className={`mt-1 text-xs ${allarme ? "" : "text-slate"}`}>
            Ultimo avviso via email: {quando(conn.avviso.inviato_il)} · {conn.avviso.esito}
          </p>
        )}
      </div>

      <div className="mt-6 flex items-baseline justify-between gap-4">
        <h2 className="text-2xl">Da controllare in NTS</h2>
        <Link href="/admin/ordini?nts=da_controllare" className="text-sm font-semibold underline underline-offset-4">
          Tutti
        </Link>
      </div>
      {daControllare === null ? (
        <p className="mt-4 rounded-md bg-ice px-4 py-6 text-center text-sm text-slate">Invio automatico a NTS non ancora attivo (migrazione 0007 da applicare).</p>
      ) : daControllare.ordini.length === 0 ? (
        <p className="mt-4 rounded-md bg-ice px-4 py-6 text-center text-sm text-slate">Nessun ordine da controllare.</p>
      ) : (
        <ul className="mt-4 divide-y divide-ice rounded-lg border border-rosso">
          {daControllare.ordini.slice(0, 10).map((o) => (
            <li key={o.id}>
              <Link href={`/admin/ordini/${o.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-ice">
                <span>
                  <span className="font-mono font-semibold">{o.riferimento_nts}</span> · {o.cliente?.ragione_sociale}{" "}
                  <span className="text-sm text-slate">({o.cliente?.codice_nts})</span>
                  {o.errore_nts && <span className="block text-xs text-rosso">{o.errore_nts}</span>}
                </span>
                <BadgeNts stato={o.stato_nts} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
