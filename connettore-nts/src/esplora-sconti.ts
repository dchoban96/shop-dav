/**
 * `npm run esplora-sconti -- --cliente 140100000 --articolo CODICE`: seconda ricognizione,
 * SOLO LETTURE su DAVNTS. Dopo la prima (esplora-prezzi) sappiamo che:
 *  - il listino è in `listini` (lc_listino, lc_conto = 0 per articolo, lc_conto = cliente per prezzi personali);
 *  - gli sconti sono in `sconti` con chiavi so_conto (cliente), so_clscan (classe cliente o numero listino),
 *    so_codart (articolo), so_codcfam (famiglia), so_clscar (classe articolo);
 *  - la funzione Graphite dbo.FNMG_GPH_PREZZO_LISTART2 applica solo listino + sconti di listino (so_clscan = listino).
 * Qui si capisce quali combinazioni DAV usa davvero e da dove viene lo sconto del cliente di prova.
 *
 * Scrive in esplorazione\sconti-AAAAMMGG-hhmmss.txt (fuori dal repo):
 *  1. listini: righe per numero listino e tipo (articolo/cliente), validità, promo, scaglioni, decimali;
 *  2. sconti: righe per combinazione di chiavi, validità, sconti oltre il secondo;
 *  3. clienti (conti 14xxxxxxx): listino e classe sconto in anagrafica; articoli: classi e famiglie;
 *  4. colonne e viste che possono decidere la priorità delle condizioni;
 *  5. caso di prova: listini e sconti che possono valere per quel cliente e articolo, e la funzione Graphite.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sql from "mssql";
import { CARTELLA, DITTA, leggiConfig } from "./config.js";
import { tabellaTesto, testo } from "./esplorazione.js";
import { configurazioneSql } from "./nts.js";
import { messaggio } from "./registro.js";

function argomento(nome: string): string | null {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1].trim() : null;
}

/** Chiave della riga di sconto: C cliente, L classe cliente/listino, A articolo, F famiglia, K classe articolo, D destinazione, P promo. */
const CHIAVE_SCONTO = `CONCAT(
    IIF(so_conto <> 0, 'C', ''), IIF(so_clscan <> 0, 'L', ''), IIF(RTRIM(ISNULL(so_codart, '')) <> '', 'A', ''),
    IIF(RTRIM(ISNULL(so_codcfam, '')) <> '', 'F', ''), IIF(so_clscar <> 0, 'K', ''), IIF(so_coddest <> 0, 'D', ''), IIF(so_codtpro <> 0, 'P', ''))`;

async function main() {
  const cfg = leggiConfig();
  const clienteArg = argomento("cliente");
  const articolo = argomento("articolo")?.toUpperCase() ?? null;
  if (clienteArg && !/^\d{1,10}$/.test(clienteArg)) throw new Error("--cliente: serve il codice conto NTS numerico");
  const cliente = clienteArg ? Number(clienteArg) : null;

  const out: string[] = [];
  const scrivi = (...righe: string[]) => out.push(...righe);
  const sezione = (titolo: string) => scrivi("", "=".repeat(90), titolo, "=".repeat(90));
  const adesso = new Date();
  const oggi = new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate());
  const p2 = (n: number) => String(n).padStart(2, "0");
  const timbro = `${adesso.getFullYear()}${p2(adesso.getMonth() + 1)}${p2(adesso.getDate())}-${p2(adesso.getHours())}${p2(adesso.getMinutes())}${p2(adesso.getSeconds())}`;
  const cartella = join(CARTELLA, "esplorazione");
  const file = join(cartella, `sconti-${timbro}.txt`);
  scrivi(`Ricognizione sconti NTS (solo letture) - ${testo(adesso)} · cliente ${cliente ?? "-"} · articolo ${articolo ?? "-"}`);

  const pool = await new sql.ConnectionPool(configurazioneSql(cfg, "ShopDAV-EsploraSconti", { database: "DAVNTS", requestTimeout: 180000 })).connect();
  const q = <T extends Record<string, unknown>>(testoSql: string, par: Record<string, unknown> = {}) => {
    const r = pool.request();
    r.input("ditta", sql.VarChar(12), DITTA);
    r.input("oggi", sql.DateTime, oggi);
    for (const [k, v] of Object.entries(par)) r.input(k, v as never);
    return r.query<T>(testoSql).then((x) => x.recordset as T[]);
  };
  const prova = async (titolo: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      scrivi(`  ERRORE in "${titolo}": ${messaggio(e)}`);
    }
  };
  const blocco = async (titolo: string, testoSql: string, par: Record<string, unknown> = {}, max = 80) =>
    prova(titolo, async () => {
      const r = await q(testoSql, par);
      scrivi("", `---- ${titolo} ----`, ...tabellaTesto(r, max));
    });

  try {
    // 1 -----------------------------------------------------------------------------------
    sezione("1. Listini");
    await blocco(
      "righe per listino e tipo (validi oggi; promo, destinazione, scaglioni di quantità, netti, prezzi con più di 2 decimali)",
      `SELECT lc_listino AS listino, IIF(lc_conto <> 0, 'cliente', 'articolo') AS tipo, COUNT(*) AS righe,
              SUM(IIF(@oggi BETWEEN lc_datagg AND lc_datscad, 1, 0)) AS validi_oggi,
              SUM(IIF(lc_codtpro <> 0, 1, 0)) AS promo, SUM(IIF(lc_coddest <> 0, 1, 0)) AS destinazione,
              SUM(IIF(lc_daquant > 1 OR lc_aquant < 999999, 1, 0)) AS scaglioni, SUM(IIF(lc_netto = 'S', 1, 0)) AS netti,
              SUM(IIF(lc_prezzo * 100 <> ROUND(lc_prezzo * 100, 0), 1, 0)) AS oltre_2_decimali,
              COUNT(DISTINCT IIF(lc_conto <> 0, lc_conto, NULL)) AS clienti
         FROM listini WHERE codditt = @ditta
        GROUP BY lc_listino, IIF(lc_conto <> 0, 'cliente', 'articolo') ORDER BY 1, 2`,
    );
    await blocco(
      "listino 2 valido oggi, per articolo: prezzi con più di 2 decimali (primi 25)",
      `SELECT TOP 25 lc_codart, lc_prezzo, lc_unmis, lc_datagg FROM listini
        WHERE codditt = @ditta AND lc_listino = 2 AND lc_conto = 0 AND @oggi BETWEEN lc_datagg AND lc_datscad
          AND lc_prezzo * 100 <> ROUND(lc_prezzo * 100, 0) ORDER BY lc_codart`,
    );
    await blocco(
      "articoli con più di un prezzo di listino 2 valido oggi (stesso articolo, chiavi diverse)",
      `SELECT TOP 25 lc_codart, COUNT(*) AS righe, MIN(lc_prezzo) AS minimo, MAX(lc_prezzo) AS massimo FROM listini
        WHERE codditt = @ditta AND lc_listino = 2 AND lc_conto = 0 AND @oggi BETWEEN lc_datagg AND lc_datscad
        GROUP BY lc_codart HAVING COUNT(*) > 1 ORDER BY 2 DESC`,
    );
    await blocco(
      "prezzi personali per cliente validi oggi: numero listino usato (lc_listino) e righe",
      `SELECT lc_listino, COUNT(*) AS righe, COUNT(DISTINCT lc_conto) AS clienti, COUNT(DISTINCT lc_codart) AS articoli
         FROM listini WHERE codditt = @ditta AND lc_conto <> 0 AND @oggi BETWEEN lc_datagg AND lc_datscad GROUP BY lc_listino`,
    );

    // 2 -----------------------------------------------------------------------------------
    sezione("2. Sconti");
    scrivi("  Chiave: C cliente · L classe cliente o numero listino (so_clscan) · A articolo · F famiglia · K classe articolo · D destinazione · P promo");
    await blocco(
      "righe per combinazione di chiavi",
      `SELECT ${CHIAVE_SCONTO} AS chiave, COUNT(*) AS righe, SUM(IIF(@oggi BETWEEN so_datagg AND so_datscad, 1, 0)) AS validi_oggi,
              COUNT(DISTINCT IIF(so_conto <> 0, so_conto, NULL)) AS clienti,
              SUM(IIF(so_scont2 <> 0, 1, 0)) AS con_sc2, SUM(IIF(so_scont3 <> 0 OR so_scont4 <> 0 OR so_scont5 <> 0 OR so_scont6 <> 0, 1, 0)) AS oltre_sc2,
              SUM(IIF(so_daquant > 1 OR so_aquant < 999999, 1, 0)) AS scaglioni,
              SUM(IIF(so_scont1 * 100 <> ROUND(so_scont1 * 100, 0) OR so_scont2 * 100 <> ROUND(so_scont2 * 100, 0), 1, 0)) AS oltre_2_decimali
         FROM sconti WHERE codditt = @ditta GROUP BY ${CHIAVE_SCONTO} ORDER BY righe DESC`,
    );
    await blocco(
      "valori di so_clscan (classe cliente o listino) e so_clscar (classe articolo) usati",
      `SELECT so_clscan, so_clscar, COUNT(*) AS righe, SUM(IIF(@oggi BETWEEN so_datagg AND so_datscad, 1, 0)) AS validi_oggi
         FROM sconti WHERE codditt = @ditta GROUP BY so_clscan, so_clscar ORDER BY righe DESC`,
    );
    await blocco(
      "esempi per ogni combinazione di chiavi (3 righe valide oggi per combinazione)",
      `SELECT chiave, so_conto, so_clscan, so_codart, so_codcfam, so_clscar, so_scont1, so_scont2, so_scont3, so_datagg, so_datscad, so_unmis
         FROM (SELECT ${CHIAVE_SCONTO} AS chiave, *, ROW_NUMBER() OVER (PARTITION BY ${CHIAVE_SCONTO} ORDER BY so_datagg DESC) AS n
                 FROM sconti WHERE codditt = @ditta AND @oggi BETWEEN so_datagg AND so_datscad) x
        WHERE n <= 3 ORDER BY chiave, n`,
      {},
      120,
    );

    // 3 -----------------------------------------------------------------------------------
    sezione("3. Anagrafiche: listino e classi");
    await blocco(
      "clienti (conti 140000000-149999999) per listino e classe sconto in anagrafica",
      `SELECT an_listino, an_clascon, COUNT(*) AS clienti, SUM(IIF(an_scont1 <> 0 OR an_scont2 <> 0, 1, 0)) AS con_sconti_in_anagrafica
         FROM anagra WHERE codditt = @ditta AND an_conto BETWEEN 140000000 AND 149999999
        GROUP BY an_listino, an_clascon ORDER BY clienti DESC`,
    );
    await blocco(
      "articoli per classe sconto (ar_clascon)",
      `SELECT ar_clascon, COUNT(*) AS articoli, SUM(IIF(ar_blocco = 'S', 1, 0)) AS bloccati FROM artico WHERE codditt = @ditta GROUP BY ar_clascon ORDER BY articoli DESC`,
    );
    await blocco(
      "famiglie (ar_famprod) con descrizione, articoli e righe di sconto",
      `SELECT f.tb_codcfam AS famiglia, f.tb_descfam AS descrizione,
              (SELECT COUNT(*) FROM artico a WHERE a.codditt = f.codditt AND a.ar_famprod = f.tb_codcfam) AS articoli,
              (SELECT COUNT(*) FROM sconti s WHERE s.codditt = f.codditt AND RTRIM(s.so_codcfam) = RTRIM(f.tb_codcfam)) AS righe_sconto
         FROM tabcfam f WHERE f.codditt = @ditta ORDER BY f.tb_codcfam`,
      {},
      60,
    );

    // 4 -----------------------------------------------------------------------------------
    sezione("4. Dove NTS decide la priorità delle condizioni");
    await blocco(
      "colonne con nomi da priorità o ricerca di prezzi e sconti",
      `SELECT TOP 120 t.name AS tabella, c.name AS colonna, TYPE_NAME(c.user_type_id) AS tipo FROM sys.columns c JOIN sys.tables t ON t.object_id = c.object_id
        WHERE c.name LIKE '%prior%' OR c.name LIKE '%prio%' OR c.name LIKE '%ricpr%' OR c.name LIKE '%ricsc%' OR c.name LIKE '%ordsc%' OR c.name LIKE '%seqsc%'
        ORDER BY t.name, c.name`,
      {},
      120,
    );
    await prova("vista busvw_listini", async () => {
      const d = await q<{ d: string | null }>("SELECT OBJECT_DEFINITION(OBJECT_ID('dbo.busvw_listini')) AS d");
      scrivi("", "---- definizione di dbo.busvw_listini ----", d[0]?.d ?? "(non trovata)");
    });

    // 5 -----------------------------------------------------------------------------------
    sezione("5. Caso di prova");
    if (!cliente || !articolo) {
      scrivi("  (salto: indicare --cliente e --articolo)");
    } else {
      const an = await q<{ an_listino: number; an_clascon: number; an_scont1: number; an_scont2: number; an_categ: number }>(
        "SELECT an_listino, an_clascon, an_scont1, an_scont2, an_categ FROM anagra WHERE codditt = @ditta AND an_conto = @cli",
        { cli: cliente },
      );
      const ar = await q<{ ar_famprod: string | null; ar_clascon: number; ar_unmis: string }>(
        "SELECT ar_famprod, ar_clascon, ar_unmis FROM artico WHERE codditt = @ditta AND ar_codart = @art",
        { art: articolo },
      );
      const listinoCli = Number(an[0]?.an_listino ?? 0);
      const classeCli = Number(an[0]?.an_clascon ?? 0);
      const famiglia = String(ar[0]?.ar_famprod ?? "").trim();
      const classeArt = Number(ar[0]?.ar_clascon ?? 0);
      scrivi(
        `  cliente ${cliente}: listino ${listinoCli}, classe sconto ${classeCli}, sconti in anagrafica ${testo(an[0]?.an_scont1)} / ${testo(an[0]?.an_scont2)}`,
        `  articolo ${articolo}: famiglia ${famiglia || "-"}, classe sconto ${classeArt}, UM ${ar[0]?.ar_unmis ?? "-"}`,
      );
      const par = { cli: cliente, art: articolo, fam: famiglia, lis: listinoCli, cls: classeCli, cla: classeArt };
      await blocco(
        "listini che possono valere (articolo, per tutti o per il cliente)",
        `SELECT lc_listino, lc_conto, lc_prezzo, lc_unmis, lc_datagg, lc_datscad, lc_codtpro, lc_coddest, lc_daquant, lc_aquant, lc_netto,
                IIF(@oggi BETWEEN lc_datagg AND lc_datscad, 'sì', 'no') AS valido_oggi
           FROM listini WHERE codditt = @ditta AND lc_codart = @art AND lc_conto IN (0, @cli) ORDER BY lc_conto DESC, lc_listino, lc_datagg DESC`,
        par,
      );
      await blocco(
        "sconti che possono valere (cliente o tutti · articolo, famiglia o tutti · classi del cliente e dell'articolo)",
        `SELECT ${CHIAVE_SCONTO} AS chiave, so_conto, so_clscan, so_codart, so_codcfam, so_clscar, so_scont1, so_scont2, so_scont3,
                so_datagg, so_datscad, so_daquant, so_aquant, so_unmis, IIF(@oggi BETWEEN so_datagg AND so_datscad, 'sì', 'no') AS valido_oggi
           FROM sconti
          WHERE codditt = @ditta AND so_conto IN (0, @cli)
            AND RTRIM(ISNULL(so_codart, '')) IN ('', @art) AND RTRIM(ISNULL(so_codcfam, '')) IN ('', @fam)
            AND so_clscar IN (0, @cla) AND so_clscan IN (0, @lis, @cls)
          ORDER BY valido_oggi DESC, chiave, so_datagg DESC`,
        par,
        100,
      );
      await blocco(
        `sconti della famiglia ${famiglia || "-"} per qualsiasi cliente (primi 40 validi oggi)`,
        `SELECT TOP 40 ${CHIAVE_SCONTO} AS chiave, so_conto, so_clscan, so_codcfam, so_clscar, so_scont1, so_scont2, so_datagg, so_datscad
           FROM sconti WHERE codditt = @ditta AND RTRIM(ISNULL(so_codcfam, '')) = @fam AND @oggi BETWEEN so_datagg AND so_datscad ORDER BY so_conto, so_clscan`,
        par,
      );
      await blocco(
        `funzione Graphite con il listino del cliente (${listinoCli})`,
        `SELECT * FROM dbo.FNMG_GPH_PREZZO_LISTART2(@ditta, @art, @lis, 1, @oggi, '', 0, 0, 0, 0)`,
        par,
      );
      await blocco(
        "ultime 10 righe d'ordine NTS di questo cliente per questo articolo (prezzo e sconti effettivi)",
        `SELECT TOP 10 t.td_datord, t.td_numord, m.mo_prezzo, m.mo_scont1, m.mo_scont2, m.mo_quant
           FROM testord t JOIN movord m ON m.codditt = t.codditt AND m.mo_tipork = t.td_tipork AND m.mo_anno = t.td_anno AND m.mo_serie = t.td_serie AND m.mo_numord = t.td_numord
          WHERE t.codditt = @ditta AND t.td_tipork = 'R' AND t.td_conto = @cli AND m.mo_codart = @art ORDER BY t.td_datord DESC`,
        par,
      );
      scrivi("", "  Confrontare con il prezzo che Business propone per questo cliente e articolo (listino, sconto, netto).");
    }
  } finally {
    await pool.close();
    mkdirSync(cartella, { recursive: true });
    writeFileSync(file, "﻿" + out.join("\r\n") + "\r\n", "utf8");
  }
  console.log(out.join("\n"));
  console.log(`\nSalvato in ${file}\nMandare questo file (resta fuori dal repo).`);
}

main().catch((e) => {
  console.error(messaggio(e));
  process.exit(1);
});
