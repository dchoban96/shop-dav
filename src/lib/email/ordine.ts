/**
 * Email di conferma ordine (STRUTTURA, sezione 9): all'ufficio e, se c'è, al cliente.
 * Con RESEND_API_KEY assente l'email non parte: si registra in console e l'ordine
 * resta con `email_inviata_il` vuoto, visibile nel dettaglio.
 */
import { Resend } from "resend";
import { formattaPrezzo } from "@/lib/dati/catalogo";
import { formattaData, type Cliente, type Ordine, type RigaOrdine } from "@/lib/dati/ordini";

type Dati = { cliente: Cliente; ordine: Ordine; righe: RigaOrdine[] };

const h = (s: string | null | undefined) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function htmlOrdine({ cliente, ordine, righe }: Dati, urlAdmin: string): string {
  const righeHtml = righe
    .map(
      (r) => `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #EEF3F7;font-family:monospace">${h(r.cod_dav)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #EEF3F7">${h(r.descrizione)}${r.note ? `<br><small style="color:#51627A">Nota: ${h(r.note)}</small>` : ""}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #EEF3F7;text-align:right">${r.quantita}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #EEF3F7">${h(r.um)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #EEF3F7;text-align:right">${formattaPrezzo(r.prezzo_finale) ?? "da definire"}</td>
      </tr>`,
    )
    .join("");
  return `<!doctype html><html lang="it"><body style="font-family:Georgia,serif;color:#122C5A;margin:0;padding:24px">
  <h1 style="font-weight:normal;font-size:22px;margin:0 0 4px">Ordine n. ${ordine.numero}</h1>
  <p style="margin:0 0 16px;color:#51627A;font-family:Arial,sans-serif;font-size:14px">
    ${h(cliente.ragione_sociale)} · codice ${h(cliente.codice_nts)}<br>
    Consegna richiesta: <strong>${h(formattaData(ordine.data_consegna_richiesta))}</strong><br>
    Inviato il ${h(formattaData(ordine.creato_il, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }))}
  </p>
  <table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:14px">
    <thead><tr style="background:#EEF3F7;text-align:left">
      <th style="padding:6px 8px">Codice</th><th style="padding:6px 8px">Articolo</th><th style="padding:6px 8px;text-align:right">Q.tà</th><th style="padding:6px 8px">UM</th><th style="padding:6px 8px;text-align:right">Prezzo</th>
    </tr></thead>
    <tbody>${righeHtml}</tbody>
  </table>
  <p style="font-family:Arial,sans-serif;font-size:14px;text-align:right;margin:12px 0">Totale netto (IVA esclusa): <strong>${formattaPrezzo(ordine.totale_netto) ?? "da definire"}</strong></p>
  ${ordine.note ? `<p style="font-family:Arial,sans-serif;font-size:14px"><strong>Note ordine:</strong> ${h(ordine.note)}</p>` : ""}
  <p style="font-family:Arial,sans-serif;font-size:13px;color:#51627A"><a href="${h(urlAdmin)}" style="color:#122C5A">Apri l’ordine nel portale</a></p>
</body></html>`;
}

export function testoOrdine({ cliente, ordine, righe }: Dati): string {
  const r = righe.map((x) => `${x.cod_dav}  ${x.descrizione}  x${x.quantita} ${x.um ?? ""}  ${formattaPrezzo(x.prezzo_finale) ?? "da definire"}${x.note ? `  [${x.note}]` : ""}`).join("\n");
  return `Ordine n. ${ordine.numero}\n${cliente.ragione_sociale} (${cliente.codice_nts})\nConsegna richiesta: ${formattaData(ordine.data_consegna_richiesta)}\n\n${r}\n\nTotale netto: ${formattaPrezzo(ordine.totale_netto) ?? "da definire"}${ordine.note ? `\nNote: ${ordine.note}` : ""}`;
}

export async function inviaEmailOrdine(dati: Dati): Promise<{ inviata: boolean; motivo?: string }> {
  const chiave = process.env.RESEND_API_KEY;
  const ufficio = process.env.EMAIL_ORDINI || "info@davsnc.it";
  const mittente = process.env.EMAIL_MITTENTE || "DAV Ordini <ordini@davsnc.it>";
  const urlAdmin = `${process.env.APP_URL || "http://localhost:3000"}/admin/ordini/${dati.ordine.id}`;
  const oggetto = `Ordine n. ${dati.ordine.numero} – ${dati.cliente.ragione_sociale}`;

  if (!chiave) {
    console.log(`[email non inviata: RESEND_API_KEY assente] A: ${ufficio}${dati.cliente.email ? `, ${dati.cliente.email}` : ""}\n${testoOrdine(dati)}`);
    return { inviata: false, motivo: "RESEND_API_KEY non configurata" };
  }
  try {
    const resend = new Resend(chiave);
    const destinatari = [ufficio, ...(dati.cliente.email ? [dati.cliente.email] : [])];
    const { error } = await resend.emails.send({ from: mittente, to: destinatari, subject: oggetto, html: htmlOrdine(dati, urlAdmin), text: testoOrdine(dati) });
    if (error) {
      console.error("Resend:", error);
      return { inviata: false, motivo: error.message };
    }
    return { inviata: true };
  } catch (e) {
    console.error("Resend:", e);
    return { inviata: false, motivo: e instanceof Error ? e.message : "errore invio" };
  }
}
