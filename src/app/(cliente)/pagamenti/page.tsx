import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Contenitore } from "@/components/Contenitore";
import { ElencoScadenze } from "@/components/documenti/ElencoScadenze";
import { euro, hrefDocumentoCliente } from "@/components/documenti/formato";
import { azienda } from "@/lib/azienda";
import { situazionePagamenti } from "@/lib/dati/documenti";
import { clientePerCodice } from "@/lib/dati/ordini";
import { leggiSessione } from "@/lib/sessione";

export const metadata: Metadata = { title: "Scadenze e pagamenti" };

/**
 * Situazione dei pagamenti del cliente: metodo, scadenze aperte, scadute, totale.
 * Solo informazione (decisione del 09/11): nessun blocco e nessun avviso altrove. Testo neutro.
 */
async function Situazione() {
  const s = await leggiSessione();
  if (!s || s.ruolo !== "cliente") redirect("/accedi");
  const cliente = await clientePerCodice(s.codiceCliente);
  if (!cliente) redirect("/accedi");
  const p = await situazionePagamenti(cliente.id);

  if (!p.disponibile) {
    return (
      <div className="mt-8 rounded-lg border border-azzurro/40 bg-bianco px-6 py-10 text-center">
        <p className="text-lg">Le tue scadenze arrivano presto qui.</p>
        <p className="mt-2 text-sm text-slate">Le stiamo collegando al gestionale. Per ora puoi chiedere all’ufficio.</p>
      </div>
    );
  }

  const scadute = p.aperte.filter((x) => x.scaduta).length;
  const aggiornato = p.aggiornatoIl
    ? new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" }).format(new Date(p.aggiornatoIl))
    : null;

  return (
    <>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-azzurro/40 bg-bianco p-5">
          <p className="etichetta">Metodo di pagamento</p>
          <p className="mt-2 text-lg">{p.pagamento.descrizione ?? "—"}</p>
          {p.pagamento.codice && <p className="text-xs text-slate">codice {p.pagamento.codice}</p>}
        </div>
        <div className="rounded-lg bg-navy p-5 text-bianco">
          <p className="etichetta text-azzurro">Da pagare</p>
          <p className="prezzo mt-2 text-3xl">{euro(p.totaleDaPagare)}</p>
          <p className="mt-1 text-sm text-azzurro">
            {p.aperte.length === 0 ? "Nessuna scadenza aperta" : `${p.aperte.length} ${p.aperte.length === 1 ? "scadenza aperta" : "scadenze aperte"}`}
          </p>
        </div>
        <div className="rounded-lg border border-azzurro/40 bg-bianco p-5">
          <p className="etichetta">Di cui scaduto</p>
          <p className="prezzo mt-2 text-3xl">{euro(p.totaleScaduto)}</p>
          <p className="mt-1 text-sm text-slate">{scadute === 0 ? "Niente di scaduto" : `${scadute} ${scadute === 1 ? "scadenza" : "scadenze"} con data passata`}</p>
        </div>
      </div>

      <section className="mt-10">
        <h2 className="text-2xl">Scadenze aperte</h2>
        {p.aperte.length === 0 ? (
          <p className="mt-3 rounded-lg border border-azzurro/40 bg-bianco px-4 py-6 text-center text-sm text-slate">Nessuna scadenza aperta.</p>
        ) : (
          <div className="mt-3">
            <ElencoScadenze scadenze={p.aperte} href={hrefDocumentoCliente} />
          </div>
        )}
      </section>

      {p.pagate.length > 0 && (
        <section className="mt-10">
          <h2 className="text-2xl">Pagate di recente</h2>
          <div className="mt-3">
            <ElencoScadenze scadenze={p.pagate} href={hrefDocumentoCliente} residuo={false} />
          </div>
        </section>
      )}

      <div className="mt-10 rounded-lg border border-azzurro/40 bg-bianco p-5 text-sm text-slate">
        <p>
          Dati presi dal gestionale DAV{aggiornato ? `, aggiornati il ${aggiornato}` : ""}. Un pagamento appena fatto può comparire dopo che l’ufficio lo
          ha registrato.
        </p>
        <p className="mt-2">
          Per chiarimenti sui pagamenti: ufficio DAV, telefono{" "}
          <a href={`tel:+39${azienda.telefonoOrdini.replace(/\s/g, "")}`} className="font-semibold text-navy underline underline-offset-2">
            {azienda.telefonoOrdini}
          </a>{" "}
          o email{" "}
          <a href={`mailto:${azienda.email}`} className="font-semibold text-navy underline underline-offset-2">
            {azienda.email}
          </a>
          .
        </p>
      </div>
    </>
  );
}

export default function Pagamenti() {
  return (
    <Contenitore className="py-8">
      <p className="text-sm">
        <Link href="/ordini?scheda=fatture" className="underline underline-offset-2">
          ← Le tue fatture
        </Link>
      </p>
      <p className="etichetta mt-6">Pagamenti</p>
      <h1 className="mt-1 text-3xl">Scadenze e pagamenti</h1>
      <Suspense fallback={<p className="mt-6 text-sm text-slate">Carico la situazione…</p>}>
        <Situazione />
      </Suspense>
    </Contenitore>
  );
}
