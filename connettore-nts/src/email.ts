/**
 * Email di allarme all'ufficio con Resend (API HTTP, niente pacchetti in più).
 * Senza RESEND_API_KEY il testo finisce solo nel registro.
 */
import type { Config } from "./config.js";
import { messaggio, registro } from "./registro.js";

const h = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function inviaAllarme(cfg: Config, oggetto: string, testo: string): Promise<boolean> {
  if (!cfg.resendApiKey) {
    registro.avviso(`email non inviata (RESEND_API_KEY vuota) → ${oggetto}`);
    return false;
  }
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: cfg.emailMittente,
        to: [cfg.emailAllarmi],
        subject: oggetto,
        text: testo,
        html: `<pre style="font-family:Arial,sans-serif;font-size:14px;white-space:pre-wrap">${h(testo)}</pre>`,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) {
      registro.errore(`email "${oggetto}" non inviata: HTTP ${r.status}`);
      return false;
    }
    registro.info(`email inviata a ${cfg.emailAllarmi}: ${oggetto}`);
    return true;
  } catch (e) {
    registro.errore(`email "${oggetto}" non inviata`, messaggio(e));
    return false;
  }
}
