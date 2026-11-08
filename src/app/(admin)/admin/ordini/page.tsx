import Link from "next/link";
import { Suspense } from "react";
import { BadgeStato } from "@/components/admin/StatoOrdine";
import { BadgeNts } from "@/components/admin/StatoNts";
import { ETICHETTA_NTS } from "@/lib/dati/nts";
import { formattaPrezzo } from "@/lib/dati/catalogo";
import { elencoOrdini, FILTRI_NTS, STATI_ADMIN } from "@/lib/dati/admin";
import { ETICHETTA_STATO, formattaData } from "@/lib/dati/ordini";
import { Contenitore } from "@/components/Contenitore";

export const metadata = { title: "Ordini" };

type Params = { stato?: string; nts?: string; q?: string; dal?: string; al?: string; pagina?: string };
type Props = { searchParams: Promise<Params> };

const campo = "rounded-md border border-azzurro bg-bianco px-3 py-2 text-sm";

function query(p: Params, extra: Record<string, string | undefined> = {}): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...p, ...extra })) if (v) s.set(k, v);
  const t = s.toString();
  return t ? `?${t}` : "";
}

async function Elenco({ searchParams }: Props) {
  const p = await searchParams;
  const pagina = Math.max(1, Number(p.pagina) || 1);
  const { ordini, totale, pagine } = await elencoOrdini({ stato: p.stato, nts: p.nts, q: p.q, dal: p.dal, al: p.al, pagina });
  const filtri = { stato: p.stato, nts: p.nts, q: p.q, dal: p.dal, al: p.al };

  return (
    <>
      <form method="get" className="grid gap-3 md:grid-cols-[1fr_170px_170px_150px_150px_auto]">
        <label className="sr-only" htmlFor="q">
          Cerca
        </label>
        <input id="q" name="q" type="search" defaultValue={p.q ?? ""} placeholder="Numero, SHOP-000123, codice o nome cliente" className={campo} />
        <label className="sr-only" htmlFor="stato">
          Stato
        </label>
        <select id="stato" name="stato" defaultValue={p.stato ?? ""} className={campo}>
          <option value="">Tutti gli stati</option>
          {STATI_ADMIN.map((s) => (
            <option key={s} value={s}>
              {ETICHETTA_STATO[s]}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="nts">
          Stato NTS
        </label>
        <select id="nts" name="nts" defaultValue={p.nts ?? ""} className={campo}>
          <option value="">NTS: tutti</option>
          {FILTRI_NTS.map((s) => (
            <option key={s} value={s}>
              {s === "da_controllare" ? "NTS: da controllare" : `NTS: ${ETICHETTA_NTS[s].toLowerCase()}`}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="dal">
          Dal
        </label>
        <input id="dal" name="dal" type="date" defaultValue={p.dal ?? ""} className={campo} />
        <label className="sr-only" htmlFor="al">
          Al
        </label>
        <input id="al" name="al" type="date" defaultValue={p.al ?? ""} className={campo} />
        <button type="submit" className="rounded-md bg-navy px-5 py-2 text-sm font-semibold text-bianco hover:bg-[#0d2144]">
          Filtra
        </button>
      </form>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-slate">
        <span>
          {totale} {totale === 1 ? "ordine" : "ordini"} · pagina {pagina} di {pagine}
        </span>
        <a href={`/admin/ordini/esporta${query(filtri)}`} className="font-semibold text-navy underline underline-offset-4">
          Esporta righe in CSV
        </a>
      </div>

      <div className="mt-3 overflow-x-auto rounded-lg border border-azzurro/40">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="bg-ice text-left">
            <tr>
              <th className="etichetta px-3 py-2">N.</th>
              <th className="etichetta px-3 py-2">Inviato</th>
              <th className="etichetta px-3 py-2">Cliente</th>
              <th className="etichetta px-3 py-2">Consegna</th>
              <th className="etichetta px-3 py-2 text-right">Righe</th>
              <th className="etichetta px-3 py-2 text-right">Totale</th>
              <th className="etichetta px-3 py-2">Stato</th>
              <th className="etichetta px-3 py-2">Stato NTS</th>
              <th className="etichetta px-3 py-2">Riferimento</th>
              <th className="etichetta px-3 py-2 text-right">N. NTS</th>
              <th className="etichetta px-3 py-2">Errore</th>
            </tr>
          </thead>
          <tbody>
            {ordini.map((o) => (
              <tr key={o.id} className="border-t border-ice hover:bg-ice/60">
                <td className="px-3 py-2 font-semibold">
                  <Link href={`/admin/ordini/${o.id}`} className="underline underline-offset-2">
                    {o.numero}
                  </Link>
                </td>
                <td className="px-3 py-2 text-slate">{formattaData(o.creato_il, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                <td className="px-3 py-2">
                  <Link href={`/admin/clienti/${o.cliente?.id}`} className="hover:underline">
                    {o.cliente?.ragione_sociale}
                  </Link>{" "}
                  <span className="text-xs text-slate">{o.cliente?.codice_nts}</span>
                </td>
                <td className="px-3 py-2">{formattaData(o.data_consegna_richiesta, { weekday: "short", day: "numeric", month: "short" })}</td>
                <td className="px-3 py-2 text-right">{o.n_righe}</td>
                <td className="px-3 py-2 text-right">{formattaPrezzo(o.totale_netto)}</td>
                <td className="px-3 py-2">
                  <BadgeStato stato={o.stato} />
                </td>
                <td className="px-3 py-2">
                  <BadgeNts stato={o.stato_nts} />
                </td>
                <td className="px-3 py-2 font-mono text-xs">{o.riferimento_nts ?? "—"}</td>
                <td className="px-3 py-2 text-right">{o.numero_nts ?? "—"}</td>
                <td className="max-w-[240px] truncate px-3 py-2 text-xs text-rosso" title={o.errore_nts ?? undefined}>
                  {o.errore_nts ?? ""}
                </td>
              </tr>
            ))}
            {ordini.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-slate">
                  Nessun ordine con questi filtri.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <nav aria-label="Pagine" className="mt-4 flex justify-end gap-2 text-sm">
        {pagina > 1 && (
          <Link href={`/admin/ordini${query(filtri, { pagina: String(pagina - 1) })}`} className="rounded-md border border-navy px-4 py-2 font-semibold">
            Precedente
          </Link>
        )}
        {pagina < pagine && (
          <Link href={`/admin/ordini${query(filtri, { pagina: String(pagina + 1) })}`} className="rounded-md border border-navy px-4 py-2 font-semibold">
            Successiva
          </Link>
        )}
      </nav>
    </>
  );
}

export default function OrdiniAdmin({ searchParams }: Props) {
  return (
    <Contenitore className="py-8">
      <p className="etichetta">Ufficio DAV</p>
      <h1 className="mt-1 text-3xl">Ordini</h1>
      <div className="mt-6">
        <Suspense fallback={<p className="text-sm text-slate">Carico gli ordini…</p>}>
          <Elenco searchParams={searchParams} />
        </Suspense>
      </div>
    </Contenitore>
  );
}
