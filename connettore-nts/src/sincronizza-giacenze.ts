/**
 * `npm run sincronizza-giacenze [-- --scrivi]`: giacenza del magazzino 1 da NTS allo shop, a mano.
 * Su NTS solo letture. SENZA --scrivi non tocca Supabase: dice solo quante giacenze cambierebbero.
 * Il servizio del connettore fa la stessa cosa da solo ogni GIACENZE_MINUTI (predefinito 15).
 */
import { leggiConfig } from "./config.js";
import { SincronizzaGiacenze } from "./giacenze.js";
import { Nts } from "./nts.js";
import { messaggio } from "./registro.js";
import { Shop } from "./shop.js";

async function main() {
  const scrivere = process.argv.includes("--scrivi");
  const cfg = leggiConfig();
  const nts = new Nts(cfg);
  try {
    await nts.connetti();
    const s = new SincronizzaGiacenze(0, () => nts.giacenze(), new Shop(cfg));
    const e = await s.esegui(scrivere);
    console.log(
      [
        `Giacenze da NTS (magazzino 1): ${e.daNts} articoli con progressivi`,
        `Articoli dello shop: ${e.articoli} · disponibili (esistenza > 0): ${e.disponibili} · su ordinazione: ${e.articoli - e.disponibili}`,
        `Giacenze cambiate rispetto allo shop: ${e.cambiate}`,
        scrivere ? "SCRITTE in Supabase." : "PROVA: niente scritto. Per scrivere: npm run sincronizza-giacenze -- --scrivi",
      ].join("\n"),
    );
  } finally {
    await nts.chiudi();
  }
}

main().catch((e) => {
  console.error(messaggio(e));
  process.exit(1);
});
