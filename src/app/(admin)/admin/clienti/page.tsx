import Link from "next/link";
import { Suspense } from "react";
import { elencoClienti } from "@/lib/dati/admin";

export const metadata = { title: "Clienti" };

type Params = { q?: string; demo?: string; pagina?: string };
type Props = { searchParams: Promise<Params> };

const campo = "rounded-md border border-azzurro bg-bianco px-3 py-2 text-sm";

async function Elenco({ searchParams }: Props) {
  const p = await searchParams;
  const pagina = Math.max(1, Number(p.pagina) || 1);
  const demo = p.demo === "1" ? true : p.demo === "0" ? false : undefined;
  const { clienti, totale, pagine } = await elencoClienti({ q: p.q, demo, pagina });
  const qs = (extra: Record<string, string>) => {
    const s = new URLSearchParams();
    if (p.q) s.set("q", p.q);
    if (p.demo) s.set("demo", p.demo);
    for (const [k, v] of Object.entries(extra)) s.set(k, v);
    return `?${s}`;
  };

  return (
    <>
      <form method="get" className="grid gap-3 md:grid-cols-[1fr_200px_auto]">
        <label htmlFor="q" className="sr-only">
          Cerca
        </label>
        <input id="q" name="q" type="search" defaultValue={p.q ?? ""} placeholder="Codice, ragione sociale o comune" className={campo} />
        <label htmlFor="demo" className="sr-only">
          Tipo
        </label>
        <select id="demo" name="demo" defaultValue={p.demo ?? ""} className={campo}>
          <option value="">Tutti i clienti</option>
          <option value="0">Da gestionale</option>
          <option value="1">Accessi demo</option>
        </select>
        <button type="submit" className="rounded-md bg-navy px-5 py-2 text-sm font-semibold text-bianco hover:bg-[#0d2144]">
          Cerca
        </button>
      </form>

      <p className="mt-6 text-sm text-slate">
        {totale} {totale === 1 ? "cliente" : "clienti"} · pagina {pagina} di {pagine}
      </p>

      {totale === 0 ? (
        <p className="mt-3 rounded-md bg-ice px-4 py-6 text-center text-sm text-slate">
          Nessun cliente. L’anagrafica arriva con l’import dei clienti da NTS.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-lg border border-azzurro/40">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-ice text-left">
              <tr>
                <th className="etichetta px-3 py-2">Codice</th>
                <th className="etichetta px-3 py-2">Ragione sociale</th>
                <th className="etichetta px-3 py-2">Comune</th>
                <th className="etichetta px-3 py-2 text-right">Ordini</th>
                <th className="etichetta px-3 py-2">Note</th>
              </tr>
            </thead>
            <tbody>
              {clienti.map((c) => (
                <tr key={c.id} className="border-t border-ice hover:bg-ice/60">
                  <td className="px-3 py-2 font-mono text-xs">{c.codice_nts}</td>
                  <td className="px-3 py-2">
                    <Link href={`/admin/clienti/${c.id}`} className="font-semibold underline underline-offset-2">
                      {c.ragione_sociale}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-slate">{c.comune ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{c.n_ordini}</td>
                  <td className="px-3 py-2 text-xs text-slate">
                    {[c.priorita_onboarding ? "priorità visita" : "", c.demo ? "demo" : ""].filter(Boolean).join(" · ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <nav aria-label="Pagine" className="mt-4 flex justify-end gap-2 text-sm">
        {pagina > 1 && (
          <Link href={`/admin/clienti${qs({ pagina: String(pagina - 1) })}`} className="rounded-md border border-navy px-4 py-2 font-semibold">
            Precedente
          </Link>
        )}
        {pagina < pagine && (
          <Link href={`/admin/clienti${qs({ pagina: String(pagina + 1) })}`} className="rounded-md border border-navy px-4 py-2 font-semibold">
            Successiva
          </Link>
        )}
      </nav>
      <p className="mt-6 text-xs text-slate">Inviti e attivazione degli accessi arrivano con Supabase Auth.</p>
    </>
  );
}

export default function ClientiAdmin({ searchParams }: Props) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <p className="etichetta">Ufficio DAV</p>
      <h1 className="mt-1 text-3xl">Clienti</h1>
      <div className="mt-6">
        <Suspense fallback={<p className="text-sm text-slate">Carico i clienti…</p>}>
          <Elenco searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}
