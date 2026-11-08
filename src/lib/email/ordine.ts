/**
 * Email di conferma ordine (STRUTTURA, sezione 9; BRIEF_INTEGRAZIONE_NTS, sezione 6).
 * - All'ufficio: oggetto con il riferimento `[SHOP-000123]`, link all'ordine nel portale
 *   e la riga sull'inserimento automatico in NTS. Resta come avviso e rete di sicurezza.
 * - Al cliente, se ha un'email: copia dell'ordine, senza link all'area ufficio né gestionale.
 * Con RESEND_API_KEY assente l'email non parte: si registra in console e l'ordine
 * resta con `email_inviata_il` vuoto, visibile nel dettaglio.
 */
import { formattaPrezzo } from "@/lib/dati/catalogo";
import { formattaData, type Cliente, type Ordine, type RigaOrdine } from "@/lib/dati/ordini";
import { riepilogoSconti, testoSconto } from "@/lib/sconti";
import { escapeHtml as h, inviaEmail } from "@/lib/email/invio";

type Dati = { cliente: Cliente; ordine: Ordine; righe: RigaOrdine[]; emailUfficio?: string };
type Opzioni = { urlAdmin?: string; notaUfficio?: string };

/** Riga per l'ufficio su cosa succede in NTS. Vuota se l'ordine non ha riferimento (migrazione 0007 non applicata). */
export function notaNts(ordine: Ordine): string | undefined {
  if (!ordine.riferimento_nts) return undefined;
  if (ordine.stato_nts === "da_inviare") return `Verrà inserito in NTS automaticamente (riferimento ${ordine.riferimento_nts}).`;
  if (ordine.stato_nts === null) return "Ordine di un cliente demo: non viene inserito in NTS.";
  return `Stato NTS: ${ordine.stato_nts}.`;
}

export function htmlOrdine({ cliente, ordine, righe }: Dati, opz: Opzioni = {}): string {
  const righeHtml = righe
    .map(
      (r) => `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #EEF3F7;font-family:monospace">${h(r.cod_dav)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #EEF3F7">${h(r.descrizione)}${r.note ? `<br><small style="color:#51627A">Nota: ${h(r.note)}</small>` : ""}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #EEF3F7;text-align:right">${r.quantita}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #EEF3F7">${h(r.um)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #EEF3F7;text-align:right;color:#51627A">${formattaPrezzo(r.prezzo_listino) ?? "—"}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #EEF3F7;text-align:right"><strong>${h(testoSconto(r) ?? "—")}</strong></td>
        <td style="padding:6px 8px;border-bottom:1px solid #EEF3F7;text-align:right">${formattaPrezzo(r.prezzo_finale) ?? "da definire"}</td>
      </tr>`,
    )
    .join("");
  const { listino, risparmio } = riepilogoSconti(righe);
  const sconti =
    risparmio >= 0.005
      ? `Totale a listino: ${formattaPrezzo(listino)}<br>Sconto cliente: <strong>−${formattaPrezzo(risparmio)}</strong><br>`
      : "";
  return `<!doctype html><html lang="it"><body style="font-family:Georgia,serif;color:#122C5A;margin:0;padding:24px">
  <h1 style="font-weight:normal;font-size:22px;margin:0 0 4px">Ordine n. ${ordine.numero}</h1>
  <p style="margin:0 0 16px;color:#51627A;font-family:Arial,sans-serif;font-size:14px">
    ${h(cliente.ragione_sociale)} · codice ${h(cliente.codice_nts)}<br>
    ${ordine.riferimento_nts ? `Riferimento: <strong>${h(ordine.riferimento_nts)}</strong><br>` : ""}
    Consegna richiesta: <strong>${h(formattaData(ordine.data_consegna_richiesta))}</strong><br>
    Inviato il ${h(formattaData(ordine.creato_il, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }))}
  </p>
  ${opz.notaUfficio ? `<p style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:14px;background:#EEF3F7;padding:8px 12px">${h(opz.notaUfficio)}</p>` : ""}
  <table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:14px">
    <thead><tr style="background:#EEF3F7;text-align:left">
      <th style="padding:6px 8px">Codice</th><th style="padding:6px 8px">Articolo</th><th style="padding:6px 8px;text-align:right">Q.tà</th><th style="padding:6px 8px">UM</th><th style="padding:6px 8px;text-align:right">Listino</th><th style="padding:6px 8px;text-align:right">Sconto</th><th style="padding:6px 8px;text-align:right">Prezzo</th>
    </tr></thead>
    <tbody>${righeHtml}</tbody>
  </table>
  <p style="font-family:Arial,sans-serif;font-size:14px;text-align:right;margin:12px 0">${sconti}Totale netto (IVA esclusa): <strong>${formattaPrezzo(ordine.totale_netto) ?? "da definire"}</strong></p>
  ${ordine.note ? `<p style="font-family:Arial,sans-serif;font-size:14px"><strong>Note ordine:</strong> ${h(ordine.note)}</p>` : ""}
  ${opz.urlAdmin ? `<p style="font-family:Arial,sans-serif;font-size:13px;color:#51627A"><a href="${h(opz.urlAdmin)}" style="color:#122C5A">Apri l’ordine nel portale</a></p>` : ""}
</body></html>`;
}

export function testoOrdine({ cliente, ordine, righe }: Dati, opz: Opzioni = {}): string {
  const r = righe
    .map((x) => {
      const sc = testoSconto(x);
      const prezzo = `${formattaPrezzo(x.prezzo_finale) ?? "da definire"}${sc ? ` (listino ${formattaPrezzo(x.prezzo_listino)}, sconto ${sc})` : ""}`;
      return `${x.cod_dav}  ${x.descrizione}  x${x.quantita} ${x.um ?? ""}  ${prezzo}${x.note ? `  [${x.note}]` : ""}`;
    })
    .join("\n");
  const { listino, risparmio } = riepilogoSconti(righe);
  const sconti = risparmio >= 0.005 ? [`Totale a listino: ${formattaPrezzo(listino)}`, `Sconto cliente: −${formattaPrezzo(risparmio)}`] : [];
  return [
    `Ordine n. ${ordine.numero}`,
    `${cliente.ragione_sociale} (${cliente.codice_nts})`,
    ...(ordine.riferimento_nts ? [`Riferimento: ${ordine.riferimento_nts}`] : []),
    `Consegna richiesta: ${formattaData(ordine.data_consegna_richiesta)}`,
    ...(opz.notaUfficio ? ["", opz.notaUfficio] : []),
    "",
    r,
    "",
    ...sconti,
    `Totale netto: ${formattaPrezzo(ordine.totale_netto) ?? "da definire"}`,
    ...(ordine.note ? [`Note: ${ordine.note}`] : []),
    ...(opz.urlAdmin ? ["", `Apri l'ordine: ${opz.urlAdmin}`] : []),
  ].join("\n");
}

/** Email all'ufficio (sempre) e copia al cliente (se ha un'email). `inviata` si riferisce a quella dell'ufficio. */
export async function inviaEmailOrdine(dati: Dati): Promise<{ inviata: boolean; motivo?: string }> {
  const ufficio = dati.emailUfficio || process.env.EMAIL_ORDINI || "info@davsnc.it";
  const urlAdmin = `${process.env.APP_URL || "http://localhost:3000"}/admin/ordini/${dati.ordine.id}`;
  const rif = dati.ordine.riferimento_nts ? `[${dati.ordine.riferimento_nts}] ` : "";
  const opz: Opzioni = { urlAdmin, notaUfficio: notaNts(dati.ordine) };

  const esito = await inviaEmail({
    a: [ufficio],
    oggetto: `${rif}Ordine n. ${dati.ordine.numero} – ${dati.cliente.ragione_sociale}`,
    html: htmlOrdine(dati, opz),
    testo: testoOrdine(dati, opz),
  });
  if (dati.cliente.email) {
    await inviaEmail({
      a: [dati.cliente.email],
      oggetto: `Ordine n. ${dati.ordine.numero} ricevuto – D.A.V.`,
      html: htmlOrdine(dati),
      testo: testoOrdine(dati),
    });
  }
  return esito;
}
