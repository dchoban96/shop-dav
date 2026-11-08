/**
 * Avvio del connettore: un giro ogni POLL_SECONDI finché il servizio non viene fermato.
 * `--una-volta` fa un solo giro ed esce (prove a mano).
 */
import { descriviConfig, leggiConfig, VERSIONE } from "./config.js";
import { inviaAllarme } from "./email.js";
import { Connettore } from "./giro.js";
import { Nts } from "./nts.js";
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

  do {
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
