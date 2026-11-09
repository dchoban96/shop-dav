import Link from "next/link";
import type { ReactNode } from "react";
import {
  type DettaglioDocumento as Dettaglio,
  type DocumentoBreve,
  type RigaDocumento,
  ETICHETTA_TIPO,
  lottoVero,
  statoPagamento,
  titoloDocumento,
} from "@/lib/dati/documenti";
import { Etichetta, EtichettaPagamento } from "./Etichetta";
import { ElencoScadenze } from "./ElencoScadenze";
import { dataCorta, dataLunga, euro, percentuale, prezzoUnitario, quantita, sconti, numero } from "./formato";

type Props = {
  d: Dettaglio;
  /** cliente: descrizioni del catalogo e link agli articoli; admin: descrizioni NTS, chiave e stato in NTS. */
  modo: "cliente" | "admin";
  hrefDocumento: (d: DocumentoBreve) => string;
  hrefOrdine: (id: number) => string;
  /** Azioni sotto il documento (es. "Riordina questi articoli"). */
  azioni?: ReactNode;
};

type Gruppo = { chiave: string; titolo: ReactNode | null; righe: RigaDocumento[] };

/**
 * Righe raggruppate come nella stampa di Business: la fattura per DDT di provenienza
 * ("Rifer. D.D.T. n° … del …"), il DDT per ordine NTS ("Rif. ord.: … del …").
 * Le righe di solo riferimento non si ripetono: diventano il titolo del gruppo.
 */
function raggruppa(d: Dettaglio, hrefDocumento: Props["hrefDocumento"], hrefOrdine: Props["hrefOrdine"]): Gruppo[] {
  const gruppi: Gruppo[] = [];
  const perChiave = new Map<string, Gruppo>();
  const fattura = d.documento.tipo !== "ddt";
  const ddtPer = new Map(d.ddt.map((x) => [`${x.numero}|${x.data_doc}`, x]));
  const ordinePer = new Map(d.ordiniShop.map((o) => [o.riferimento, o]));
  for (const r of d.righe) {
    if (r.tipo_riga === "rif_ddt" || r.tipo_riga === "rif_ordine") continue;
    let chiave = "";
    let titolo: ReactNode = null;
    if (fattura && r.rif_ddt_numero !== null) {
      chiave = `ddt|${r.rif_ddt_numero}|${r.rif_ddt_data}`;
      const trovato = ddtPer.get(`${r.rif_ddt_numero}|${r.rif_ddt_data}`);
      const testo = `DDT n. ${numero(r.rif_ddt_numero)} del ${dataCorta(r.rif_ddt_data)}`;
      titolo = trovato ? (
        <Link href={hrefDocumento(trovato)} className="underline underline-offset-2 hover:text-slate">
          {testo}
        </Link>
      ) : (
        testo
      );
    } else if (!fattura && (r.rif_ordine_numero !== null || r.rif_ordine_shop)) {
      chiave = `ord|${r.rif_ordine_numero}|${r.rif_ordine_data}|${r.rif_ordine_shop}`;
      const shop = r.rif_ordine_shop ? ordinePer.get(r.rif_ordine_shop) : undefined;
      titolo = (
        <>
          {r.rif_ordine_numero !== null ? `Ordine n. ${r.rif_ordine_numero}${r.rif_ordine_data ? ` del ${dataCorta(r.rif_ordine_data)}` : ""}` : "Ordine"}
          {shop && (
            <>
              {" · "}
              <Link href={hrefOrdine(shop.id)} className="underline underline-offset-2 hover:text-slate">
                ordine dallo shop n. {shop.numero}
              </Link>
            </>
          )}
        </>
      );
    }
    let g = perChiave.get(chiave);
    if (!g) {
      g = { chiave, titolo, righe: [] };
      perChiave.set(chiave, g);
      gruppi.push(g);
    }
    g.righe.push(r);
  }
  return gruppi;
}

export function DettaglioDocumento({ d, modo, hrefDocumento, hrefOrdine, azioni }: Props) {
  const doc = d.documento;
  const ddt = doc.tipo === "ddt";
  const admin = modo === "admin";
  const gruppi = raggruppa(d, hrefDocumento, hrefOrdine);
  const pagamento = ddt ? null : statoPagamento(d.scadenze);
  const segno = doc.tipo === "nota_credito" ? "−" : "";

  const info: [string, ReactNode][] = (
    [
      ["Data", dataLunga(doc.data_doc)],
      ["Destinazione", doc.destinazione],
      ["Pagamento", [doc.pagamento_codice, doc.pagamento_desc].filter(Boolean).join(" ") || null],
      ["Agente", doc.agente_desc],
      ...(ddt
        ? ([
            ["Trasporto a cura", doc.trasporto_a_cura],
            ["Causale", doc.causale_trasporto],
            ["Aspetto esteriore", doc.aspetto_esteriore],
            ["Vettore", doc.vettore],
            ["Colli", doc.totale_colli !== null ? quantita(doc.totale_colli) : null],
            ["Peso", doc.peso !== null ? `${quantita(doc.peso)} kg` : null],
          ] as [string, ReactNode][])
        : []),
    ] as [string, ReactNode][]
  ).filter(([, v]) => v !== null && v !== undefined && v !== "");

  return (
    <>
      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="etichetta">{ETICHETTA_TIPO[doc.tipo]}</p>
          <h1 className="mt-1 text-3xl">{titoloDocumento(doc)}</h1>
          <p className="mt-1 text-sm text-slate">del {dataLunga(doc.data_doc)}</p>
          {admin && (
            <p className="mt-1 font-mono text-xs text-slate">
              {doc.chiave_nts} · aggiornato {new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Rome" }).format(new Date(doc.aggiornato_il))}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!doc.presente_in_nts && <Etichetta tono="forte">Non più in NTS</Etichetta>}
          <EtichettaPagamento stato={pagamento} />
        </div>
      </div>

      {!doc.presente_in_nts && (
        <p className="mt-4 rounded-lg border border-navy bg-bianco px-4 py-3 text-sm">
          Questo documento non risulta più nel gestionale: il cliente non lo vede.
        </p>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
        <dl className="grid grid-cols-[130px_1fr] gap-x-4 gap-y-1.5 rounded-lg border border-azzurro/40 bg-bianco p-4 text-sm sm:grid-cols-[150px_1fr]">
          {info.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-slate">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <Collegamenti d={d} admin={admin} hrefDocumento={hrefDocumento} hrefOrdine={hrefOrdine} />
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-azzurro/40 bg-bianco p-4">
        <table className="w-full text-sm">
          <thead className="text-left">
            <tr className="border-b border-azzurro/40">
              <th className="etichetta py-2 font-semibold">Articolo</th>
              <th className="etichetta py-2 pl-3 text-right font-semibold">Q.tà</th>
              <th className="etichetta hidden py-2 pl-4 text-right font-semibold sm:table-cell">Prezzo</th>
              <th className="etichetta hidden py-2 pl-4 text-right font-semibold sm:table-cell">Sconti</th>
              <th className="etichetta py-2 pl-4 text-right font-semibold">Importo</th>
              <th className="etichetta hidden py-2 pl-4 text-right font-semibold md:table-cell">IVA</th>
            </tr>
          </thead>
          {gruppi.map((g) => (
            <tbody key={g.chiave || "senza"}>
              {g.titolo && (
                <tr>
                  <th colSpan={6} scope="rowgroup" className="bg-ice px-2 py-2 text-left text-sm font-semibold">
                    {g.titolo}
                  </th>
                </tr>
              )}
              {g.righe.map((r) => (r.tipo_riga === "nota" ? <RigaNota key={r.id} r={r} /> : <RigaArticolo key={r.id} r={r} admin={admin} />))}
            </tbody>
          ))}
        </table>
        {gruppi.length === 0 && <p className="py-6 text-center text-sm text-slate">Nessuna riga.</p>}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
        <div>
          {!ddt && d.iva.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-azzurro/40 bg-bianco p-4">
              <h2 className="text-xl">Riepilogo IVA</h2>
              <table className="mt-2 w-full text-sm">
                <thead className="text-left">
                  <tr className="border-b border-azzurro/40">
                    <th className="etichetta py-1.5 font-semibold">Codice</th>
                    <th className="etichetta py-1.5 pl-3 text-right font-semibold">Imponibile</th>
                    <th className="etichetta py-1.5 pl-3 text-right font-semibold">Aliquota</th>
                    <th className="etichetta py-1.5 pl-3 text-right font-semibold">Imposta</th>
                    <th className="etichetta hidden py-1.5 pl-3 font-semibold sm:table-cell">Descrizione</th>
                  </tr>
                </thead>
                <tbody>
                  {d.iva.map((v) => (
                    <tr key={v.codice_iva} className="border-b border-ice">
                      <td className="py-1.5">{v.codice_iva}</td>
                      <td className="py-1.5 pl-3 text-right">{euro(v.imponibile)}</td>
                      <td className="py-1.5 pl-3 text-right">{percentuale(v.aliquota)}</td>
                      <td className="py-1.5 pl-3 text-right">{euro(v.imposta)}</td>
                      <td className="hidden py-1.5 pl-3 text-slate sm:table-cell">{v.descrizione ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {doc.note && (
            <div className="mt-4 rounded-lg border border-azzurro/40 bg-bianco p-4 text-sm">
              <h2 className="etichetta">Note</h2>
              <p className="mt-1 whitespace-pre-line">{doc.note}</p>
            </div>
          )}
        </div>

        <dl className="h-fit rounded-lg border border-azzurro/40 bg-bianco p-4 text-sm">
          <div className="flex justify-between gap-4 py-1">
            <dt className="text-slate">Totale imponibile</dt>
            <dd>
              {segno}
              {euro(Math.abs(doc.imponibile))}
            </dd>
          </div>
          <div className="flex justify-between gap-4 py-1">
            <dt className="text-slate">{ddt ? "Totale IVA" : "Totale imposta"}</dt>
            <dd>
              {segno}
              {euro(Math.abs(doc.iva))}
            </dd>
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-4 border-t border-azzurro/40 pt-3">
            <dt className="font-semibold">{ddt ? "Totale a pagare" : "Totale documento"}</dt>
            <dd className="prezzo text-2xl">
              {segno}
              {euro(Math.abs(doc.totale))}
            </dd>
          </div>
        </dl>
      </div>

      {!ddt && d.scadenze.length > 0 && (
        <section className="mt-8">
          <h2 className="text-2xl">Scadenze</h2>
          <div className="mt-3">
            <ElencoScadenze scadenze={d.scadenze} />
          </div>
        </section>
      )}

      {azioni && <div className="mt-8">{azioni}</div>}
    </>
  );
}

function Collegamenti({ d, admin, hrefDocumento, hrefOrdine }: Pick<Props, "d" | "hrefDocumento" | "hrefOrdine"> & { admin: boolean }) {
  const ddt = d.documento.tipo === "ddt";
  return (
    <div className="h-fit rounded-lg border border-azzurro/40 bg-bianco p-4 text-sm">
      <h2 className="etichetta">Collegamenti</h2>
      <ul className="mt-2 space-y-1.5">
        {ddt ? (
          <li>
            {d.fattura ? (
              <>
                Fatturato con{" "}
                <Link href={hrefDocumento(d.fattura)} className="font-semibold underline underline-offset-2">
                  {titoloDocumento({ ...d.fattura, sottotipo: null, serie: "" })} del {dataCorta(d.fattura.data_doc)}
                </Link>
              </>
            ) : (
              <span className="text-slate">Non ancora fatturato</span>
            )}
          </li>
        ) : (
          <li>
            {d.ddt.length > 0 ? `Comprende ${d.ddt.length} DDT: ` : <span className="text-slate">Nessun DDT collegato</span>}
            {d.ddt.map((x, i) => (
              <span key={x.id}>
                {i > 0 && ", "}
                <Link href={hrefDocumento(x)} className="underline underline-offset-2">
                  n. {numero(x.numero)}
                </Link>
              </span>
            ))}
          </li>
        )}
        {d.ordiniShop.map((o) => (
          <li key={o.id}>
            {admin ? "Ordine " : "Dal tuo ordine "}
            <Link href={hrefOrdine(o.id)} className="font-semibold underline underline-offset-2">
              dallo shop n. {o.numero}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RigaNota({ r }: { r: RigaDocumento }) {
  return (
    <tr className="border-b border-ice">
      <td colSpan={6} className="py-2 pr-2 text-sm text-slate italic">
        {r.descrizione}
      </td>
    </tr>
  );
}

function RigaArticolo({ r, admin }: { r: RigaDocumento; admin: boolean }) {
  // Cliente: la descrizione pulita del catalogo; l'articolo generico M (e chi non è nel catalogo) tiene quella della riga.
  const nome = (admin ? r.descrizione : (r.descrizione_shop ?? r.descrizione)) ?? r.cod_dav ?? "—";
  const sc = sconti(r.sconti_testo);
  const dettagli = [
    r.cod_dav,
    r.cod_fornitore ? `cod. forn. ${r.cod_fornitore}` : null,
    lottoVero(r) ? `lotto ${r.lotto}${r.scadenza_lotto ? ` scad. ${dataCorta(r.scadenza_lotto)}` : ""}` : null,
  ].filter(Boolean);
  return (
    <tr className="border-b border-ice align-top">
      <td className="py-2 pr-2">
        {!admin && r.in_catalogo && r.cod_dav ? (
          <Link href={`/catalogo/${encodeURIComponent(r.cod_dav)}`} className="font-semibold hover:underline">
            {nome}
          </Link>
        ) : (
          <span className="font-semibold">{nome}</span>
        )}
        {admin && r.descrizione_shop && r.descrizione_shop !== r.descrizione && <span className="block text-xs text-slate">shop: {r.descrizione_shop}</span>}
        {dettagli.length > 0 && <p className="text-xs text-slate">{dettagli.join(" · ")}</p>}
        <p className="text-xs text-slate sm:hidden">
          {prezzoUnitario(r.prezzo)}
          {sc ? ` · sconto ${sc}` : ""}
        </p>
      </td>
      <td className="py-2 pl-3 text-right whitespace-nowrap">
        {quantita(r.quantita)} <span className="text-xs text-slate">{r.um}</span>
      </td>
      <td className="hidden py-2 pl-4 text-right whitespace-nowrap sm:table-cell">{prezzoUnitario(r.prezzo)}</td>
      <td className="hidden py-2 pl-4 text-right whitespace-nowrap sm:table-cell">{sc ?? "—"}</td>
      <td className="py-2 pl-4 text-right whitespace-nowrap">{euro(r.importo)}</td>
      <td className="hidden py-2 pl-4 text-right text-slate md:table-cell">{r.aliquota_iva !== null ? percentuale(r.aliquota_iva) : (r.codice_iva ?? "—")}</td>
    </tr>
  );
}
