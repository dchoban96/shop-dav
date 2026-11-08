/**
 * `npm run cerca-riferimento -- SHOP-000123`: SOLO LETTURE.
 * Punto aperto 1 del brief: in quale colonna di DAVNTS.dbo.testord NTS salva il RIFERIMENTO.
 * Prova tutte le colonne di testo di testord sugli ordini cliente (tipo R) degli ultimi due anni
 * e stampa quelle che contengono esattamente il riferimento dato.
 * Il risultato va messo in TESTORD_COLONNA_RIFERIMENTO nel file .env.
 */
import sql from "mssql";
import { DITTA, leggiConfig } from "./config.js";
import { configurazioneSql } from "./nts.js";
import { messaggio } from "./registro.js";

async function main() {
  const rif = (process.argv[2] ?? "").trim();
  if (!rif) {
    console.log("Uso: npm run cerca-riferimento -- SHOP-000123   (un riferimento già entrato in NTS)");
    process.exit(1);
  }
  const cfg = leggiConfig();
  const pool = await new sql.ConnectionPool(configurazioneSql(cfg, "ShopDAV-CercaRiferimento", { requestTimeout: 60000 })).connect();
  try {
    const colonne = await pool.request().input("len", sql.Int, rif.length).query<{ name: string }>(
      `SELECT c.name FROM DAVNTS.sys.columns c JOIN DAVNTS.sys.types t ON t.user_type_id = c.user_type_id
        WHERE c.object_id = OBJECT_ID('DAVNTS.dbo.testord') AND t.name IN ('varchar', 'nvarchar', 'char', 'nchar')
          AND (c.max_length = -1 OR c.max_length >= @len)`,
    );
    console.log(`Cerco "${rif}" in ${colonne.recordset.length} colonne di testo di DAVNTS.dbo.testord…`);
    const anno = new Date().getFullYear();
    let trovate = 0;
    for (const { name } of colonne.recordset) {
      // Il nome della colonna viene da sys.columns, quotato tra parentesi quadre.
      const col = `[${name.replace(/]/g, "]]")}]`;
      const r = await pool
        .request()
        .input("ditta", sql.VarChar(12), DITTA)
        .input("anno", sql.Int, anno - 1)
        .input("rif", sql.NVarChar(100), rif)
        .query<{ td_anno: number; td_numord: number; td_conto: number }>(
          `SELECT TOP 5 td_anno, td_numord, td_conto FROM DAVNTS.dbo.testord
            WHERE codditt = @ditta AND td_tipork = 'R' AND td_anno >= @anno AND RTRIM(${col}) = @rif`,
        );
      for (const o of r.recordset) {
        trovate++;
        console.log(`  colonna ${name}: ordine ${o.td_numord}/${o.td_anno}, cliente ${o.td_conto}`);
      }
    }
    console.log(trovate ? "\nMettere il nome della colonna in TESTORD_COLONNA_RIFERIMENTO nel file .env." : "\nRiferimento non trovato in nessuna colonna di testord.");
  } finally {
    await pool.close();
  }
}

main().catch((e) => {
  console.error(messaggio(e));
  process.exit(1);
});
