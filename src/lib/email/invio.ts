/**
 * Invio email con Resend. Senza RESEND_API_KEY l'email non parte: il testo finisce in
 * console e il chiamante riceve `inviata: false` con il motivo.
 */
import { Resend } from "resend";

export type Email = { a: string[]; oggetto: string; html: string; testo: string };

export function mittente(): string {
  return process.env.EMAIL_MITTENTE || "DAV Ordini <ordini@davsnc.it>";
}

export async function inviaEmail(e: Email): Promise<{ inviata: boolean; motivo?: string }> {
  const chiave = process.env.RESEND_API_KEY;
  const a = e.a.filter(Boolean);
  if (a.length === 0) return { inviata: false, motivo: "nessun destinatario" };
  if (!chiave) {
    console.log(`[email non inviata: RESEND_API_KEY assente] A: ${a.join(", ")} · ${e.oggetto}\n${e.testo}`);
    return { inviata: false, motivo: "RESEND_API_KEY non configurata" };
  }
  try {
    const { error } = await new Resend(chiave).emails.send({ from: mittente(), to: a, subject: e.oggetto, html: e.html, text: e.testo });
    if (error) {
      console.error("Resend:", error);
      return { inviata: false, motivo: error.message };
    }
    return { inviata: true };
  } catch (err) {
    console.error("Resend:", err);
    return { inviata: false, motivo: err instanceof Error ? err.message : "errore invio" };
  }
}

export const escapeHtml = (s: string | null | undefined) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
