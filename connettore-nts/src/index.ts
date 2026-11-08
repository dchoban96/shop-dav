/**
 * Avvio del connettore: un giro ogni POLL_SECONDI finché il servizio non viene fermato.
 * `--una-volta` fa un solo giro ed esce (prove a mano).
 */
import { join } from "node:path";
import { CARTELLA, descriviConfig, leggiConfig, VERSIONE } from "./config.js";
import { inviaAllarme } from "./email.js";
import { Connettore } from "./giro.js";
import { Nts } from "./nts.js";
import { GIORNI_LOG, pulisciLog } from "./pulizia-log.js";
import { messaggio, registro } from "./registro.js";
import { Shop } from "./shop.js";

async function main() {
  const cfg = leggiConfig();
  const unaVolta = process.argv.includes("--una-volta");
  registro.info(`Connettore Shop DAV → NTS ${VERSIONE} · ${descriviConfig(cfg)}`);

  const nts = new Nts(cfg);
  const connettore = new Connettore(cfg, nts, new Shop(cfg), (oggetto, testo) => inviaAllarme(cfg, oggetto, testo));

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

  // Registri ruotati da NSSM: si tengono gli ultimi GIORNI_LOG giorni (controllo all'avvio e una volta al giorno).
  let ultimaPulizia = 0;
  const pulizia = () => {
    if (Date.now() - ultimaPulizia < 24 * 60 * 60 * 1000) return;
    ultimaPulizia = Date.now();
    const via = pulisciLog(join(CARTELLA, "logs"));
    if (via.length) registro.info(`Registri più vecchi di ${GIORNI_LOG} giorni cancellati: ${via.length}`);
  };

  do {
    pulizia();
    await connettore.giro();
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
