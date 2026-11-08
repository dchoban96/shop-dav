/**
 * `npm run controlla`: verifica di installazione, SOLO LETTURE.
 * - connessione a SQL Server e versione;
 * - colonne reali delle tabelle di frontiera (tipo, precisione, scala, lunghezza);
 * - letture su anagra, artico, testord (permessi del login);
 * - una lettura che shop_dav NON deve poter fare (DAVNTS.dbo.movord): con sa riesce, con shop_dav deve fallire;
 * - colonna di testord per il riferimento, se impostata;
 * - Supabase: lettura degli ordini in coda.
 */
import sql from "mssql";
import { descriviConfig, DITTA, leggiConfig } from "./config.js";
import { Nts } from "./nts.js";
import { messaggio } from "./registro.js";
import { Shop } from "./shop.js";

const ok = (t: string) => console.log(`  OK      ${t}`);
const no = (t: string) => console.log(`  ERRORE  ${t}`);
const info = (t: string) => console.log(`          ${t}`);

async function main() {
  const cfg = leggiConfig();
  console.log(`\nConfigurazione: ${descriviConfig(cfg)}\n`);
  let errori = 0;

  console.log("SQL Server");
  const nts = new Nts(cfg);
  try {
    await nts.connetti();
    ok("connessione e colonne di frontiera");
    const pool = await new sql.ConnectionPool({
      server: cfg.mssql.server,
      port: cfg.mssql.porta,
      database: "NTS_FRONTIERA",
      user: cfg.mssql.utente,
      password: cfg.mssql.password,
      options: { instanceName: cfg.mssql.istanza, encrypt: true, trustServerCertificate: cfg.mssql.trustServerCertificate, appName: "ShopDAV-Controllo" },
    }).connect();
    try {
      const v = await pool.request().query<{ v: string; u: string }>("SELECT CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(50)) AS v, SUSER_SNAME() AS u");
      info(`versione ${v.recordset[0].v}, connesso come ${v.recordset[0].u}`);

      for (const [nome, cols] of [
        ["GPH_TESTATA_NTS", nts.colTestata],
        ["GPH_RIGA_NTS", nts.colRiga],
      ] as const) {
        console.log(`\n  Colonne di ${nome}:`);
        for (const c of cols.values()) {
          const det = ["decimal", "numeric"].includes(c.tipo) ? `(${c.precisione},${c.scala})` : c.lunghezza !== 0 && ["varchar", "nvarchar", "char", "nchar"].includes(c.tipo) ? `(${c.lunghezza < 0 ? "max" : c.lunghezza})` : "";
          info(`${c.nome.padEnd(22)} ${c.tipo}${det}`);
        }
      }
      console.log("");

      for (const [tab, q] of [
        ["DAVNTS.dbo.anagra", "SELECT COUNT(*) AS n FROM DAVNTS.dbo.anagra WHERE codditt = @ditta"],
        ["DAVNTS.dbo.artico", "SELECT COUNT(*) AS n FROM DAVNTS.dbo.artico WHERE codditt = @ditta"],
        ["DAVNTS.dbo.testord", "SELECT COUNT(*) AS n FROM DAVNTS.dbo.testord WHERE codditt = @ditta AND td_tipork = 'R'"],
        ["NTS_FRONTIERA.dbo.GPH_TESTATA_NTS", "SELECT COUNT(*) AS n FROM dbo.GPH_TESTATA_NTS"],
        ["NTS_FRONTIERA.dbo.GPH_SEMAFORO", "SELECT COUNT(*) AS n FROM dbo.GPH_SEMAFORO"],
      ] as const) {
        try {
          const r = await pool.request().input("ditta", sql.VarChar(12), DITTA).query<{ n: number }>(q);
          ok(`lettura ${tab}: ${r.recordset[0].n} righe`);
        } catch (e) {
          errori++;
          no(`lettura ${tab}: ${messaggio(e)}`);
        }
      }
      try {
        await pool.request().query("SELECT TOP 1 1 AS x FROM DAVNTS.dbo.movord");
        info(`lettura DAVNTS.dbo.movord riuscita: normale con sa, con shop_dav deve FALLIRE (permessi troppo larghi)`);
      } catch {
        ok("lettura DAVNTS.dbo.movord negata (permessi minimi corretti)");
      }

      const ultimi = await pool
        .request()
        .query<{ ID: number; RIFERIMENTO: string | null; STATO_LAVORAZIONE: string; NUMERO: number | null; DATA_INS: Date }>(
          "SELECT TOP 5 ID, RIFERIMENTO, STATO_LAVORAZIONE, NUMERO, DATA_INS FROM dbo.GPH_TESTATA_NTS WHERE RIFERIMENTO LIKE 'SHOP-%' ORDER BY ID DESC",
        );
      console.log("\n  Ultime testate dello shop in frontiera:");
      if (!ultimi.recordset.length) info("nessuna");
      for (const t of ultimi.recordset) info(`ID ${t.ID}  ${t.RIFERIMENTO}  stato ${t.STATO_LAVORAZIONE}  numero ${t.NUMERO ?? "-"}  ${t.DATA_INS?.toLocaleString?.("it-IT") ?? ""}`);
    } finally {
      await pool.close();
    }
    info(cfg.colonnaRiferimentoTestord ? `colonna riferimento in testord: ${cfg.colonnaRiferimentoTestord} (verificata)` : "colonna riferimento in testord: non impostata (npm run cerca-riferimento -- SHOP-...)");
  } catch (e) {
    errori++;
    no(`SQL Server: ${messaggio(e)}`);
  } finally {
    await nts.chiudi();
  }

  console.log("\nSupabase");
  try {
    const shop = new Shop(cfg);
    const inCorso = await shop.inAttesaDiEsito();
    const vecchi = await shop.inInvioDaTroppo(2);
    ok(`lettura ordini: ${inCorso.length} in attesa di esito, ${vecchi.length} rimasti in invio`);
  } catch (e) {
    errori++;
    no(`Supabase: ${messaggio(e)} (migrazione 0007 applicata? chiave service role giusta?)`);
  }

  console.log(errori ? `\n${errori} controlli non superati.\n` : "\nTutti i controlli superati.\n");
  process.exit(errori ? 1 : 0);
}

main().catch((e) => {
  console.error(messaggio(e));
  process.exit(1);
});
