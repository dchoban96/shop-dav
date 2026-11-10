/**
 * Avvio del connettore: un giro ogni POLL_SECONDI finché il servizio non viene fermato.
 * `--una-volta` fa un solo giro ed esce (prove a mano).
 */
import { join } from "node:path";
import { CARTELLA, descriviConfig, leggiConfig, VERSIONE } from "./config.js";
import { inviaAllarme } from "./email.js";
import { Connettore } from "./giro.js";
import { SincronizzaGiacenze } from "./giacenze.js";
import { Nts } from "./nts.js";
import { attivaFileRegistro, messaggio, registro } from "./registro.js";
import { Shop } from "./shop.js";

async function main() {
  // Registro in logs\connettore.log, ruotato ogni giorno, 30 giorni conservati.
  // Come servizio (NSSM imposta CONNETTORE_SERVIZIO=1) solo su file, a mano anche a video.
  attivaFileRegistro(join(CARTELLA, "logs"), { giorni: 30, soloFile: process.env.CONNETTORE_SERVIZIO === "1" });
  const cfg = leggiConfig();
  const unaVolta = process.argv.includes("--una-volta");
  registro.info(`Connettore Shop DAV → NTS ${VERSIONE} · ${descriviConfig(cfg)}`);

  const nts = new Nts(cfg);
  const shop = new Shop(cfg);
  const connettore = new Connettore(cfg, nts, shop, (oggetto, testo) => inviaAllarme(cfg, oggetto, testo));
  // Giacenza del magazzino 1 nello shop ogni GIACENZE_MINUTI (solo letture su NTS, solo differenze su Supabase).
  const giacenze = new SincronizzaGiacenze(cfg.giacenzeMinuti, () => nts.giacenze(), shop);

  let fermo = false;
  let sveglia: (() => void) | null = null;
  const ferma = (segnale: string) => {
    if (fermo) return;
    registro.info(`${segnale}: chiudo dopo il giro in corso`);
    fermo = true;
    sveglia?.();
  };
  process.on("SIGINT", () => ferma("SIGINT"));
  process.on("SIGTERM", () => ferma("SIGTERM"));
  process.on("SIGBREAK", () => ferma("SIGBREAK"));

  do {
    const { sqlOk } = await connettore.giro();
    if (sqlOk) await giacenze.forse();
    if (unaVolta || fermo) break;
    await new Promise<void>((ok) => {
      const t = setTimeout(ok, cfg.pollSecondi * 1000);
      sveglia = () => {
        clearTimeout(t);
        ok();
      };
    });
    sveglia = null;
  } while (!fermo);

  await nts.chiudi();
  registro.info("Connettore fermato");
}

main().catch((e) => {
  registro.errore("Avvio non riuscito", messaggio(e));
  process.exit(1);
});
