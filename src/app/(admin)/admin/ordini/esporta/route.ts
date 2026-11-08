/**
 * Esportazione CSV delle righe ordine filtrate, per l'inserimento in NTS.
 * Separatore `;` e BOM UTF-8 perché Excel in italiano la apra correttamente.
 * Le route non passano dal layout: il controllo admin sta qui.
 */
import { righePerEsportazione } from "@/lib/dati/admin";
import { leggiSessioneAdmin } from "@/lib/sessione";

const cella = (v: unknown): string => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const numero = (v: number | null): string => (v === null ? "" : v.toFixed(4).replace(/\.?0+$/, "").replace(".", ","));

export async function GET(request: Request) {
  if (!(await leggiSessioneAdmin())) return new Response("Non autorizzato", { status: 401 });
  const u = new URL(request.url).searchParams;
  const dati = await righePerEsportazione({
    stato: u.get("stato") ?? undefined,
    nts: u.get("nts") ?? undefined,
    q: u.get("q") ?? undefined,
    dal: u.get("dal") ?? undefined,
    al: u.get("al") ?? undefined,
  });

  const intestazione = [
    "numero_ordine", "data_ordine", "stato", "codice_cliente", "ragione_sociale", "consegna_richiesta", "note_ordine",
    "cod_dav", "descrizione", "quantita", "um", "prezzo_listino", "sconto1", "sconto2", "prezzo_accordato", "prezzo_finale", "note_riga",
    "riferimento_nts", "stato_nts", "numero_nts",
  ];
  const righe = [intestazione.join(";")];
  for (const { ordine: o, righe: rr } of dati) {
    for (const r of rr) {
      righe.push(
        [
          o.numero, o.creato_il.slice(0, 10), o.stato, o.cliente?.codice_nts, o.cliente?.ragione_sociale, o.data_consegna_richiesta, o.note,
          r.cod_dav, r.descrizione, numero(r.quantita), r.um, numero(r.prezzo_listino), numero(r.sconto1), numero(r.sconto2),
          numero(r.prezzo_accordato), numero(r.prezzo_finale), r.note,
          o.riferimento_nts, o.stato_nts, o.numero_nts,
        ]
          .map(cella)
          .join(";"),
      );
    }
  }
  const oggi = new Date().toISOString().slice(0, 10);
  return new Response("﻿" + righe.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ordini-dav-${oggi}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
