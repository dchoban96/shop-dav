/**
 * Controllo programmato del connettore NTS (chiamato ogni 10 minuti dal workflow
 * `.github/workflows/controllo-connettore.yml`).
 * Se il connettore tace da più di MINUTI_SILENZIO minuti, `controllaConnettore` manda
 * l'email all'ufficio (al massimo una all'ora). Così l'allarme parte anche di notte e nel
 * weekend, quando nessuno conferma ordini né apre il cruscotto.
 * Protetto da CRON_SECRET (header `Authorization: Bearer ...`): senza chiave non fa nulla.
 */
import { controllaConnettore } from "@/lib/dati/nts";

function uguali(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function GET(request: Request) {
  const segreto = process.env.CRON_SECRET?.trim();
  if (!segreto) return new Response("CRON_SECRET non configurato", { status: 503 });
  const ricevuto = request.headers.get("authorization") ?? "";
  if (!uguali(ricevuto, `Bearer ${segreto}`)) return new Response("Non autorizzato", { status: 401 });

  const c = await controllaConnettore();
  return Response.json(
    { connettore: c.stato ? (c.fermo ? "fermo" : "attivo") : "mai_partito", minuti_dall_ultimo_giro: c.minuti },
    { headers: { "cache-control": "no-store" } },
  );
}
