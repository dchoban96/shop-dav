/**
 * `npm run esplora-giacenze -- --articoli OLIGI5,MOZGIU1,DOLMAS`: ricognizione SOLO LETTURE su DAVNTS
 * per portare la giacenza nello shop (tabella giacenze → "disponibile / in esaurimento / su ordinazione").
 *
 * Scrive in esplorazione\giacenze-AAAAMMGG-hhmmss.txt (fuori dal repo):
 *  1. login e permessi;
 *  2. come la calcola Graphite: definizioni di GPH_GIACENZE_UNI, GPH_V_PROGRESSIVI_ARTICOLO,
 *     sp_GPH_PROGRESSIVI_ARTICOLO, SP_GPH_ART_PALMARE_DS e degli oggetti che usano (a cascata);
 *  3. magazzini (tabmaga) e tabelle con nomi da giacenze/progressivi: colonne e righe;
 *  4. per le tabelle dei progressivi: totali per magazzino delle colonne di esistenza, impegnato, ordinato;
 *  5. articoli di prova: righe di quelle tabelle e delle viste Graphite.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sql from "mssql";
import { CARTELLA, DITTA, leggiConfig } from "./config.js";
import { quota, tabellaTesto, testo } from "./esplorazione.js";
import { configurazioneSql } from "./nts.js";
import { messaggio } from "./registro.js";

function argomento(nome: string): string | null {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1].trim() : null;
}

const OGGETTI_GRAPHITE = ["dbo.GPH_GIACENZE_UNI", "dbo.GPH_V_PROGRESSIVI_ARTICOLO", "dbo.sp_GPH_PROGRESSIVI_ARTICOLO", "dbo.SP_GPH_ART_PALMARE_DS"];
const MODELLI_TABELLE = ["%giac%", "%esist%", "artpro%", "%progr%art%", "%dispon%", "tabmaga"];
/** Colonne "di quantità" dei progressivi: esistenza, impegnato, ordinato, disponibile. */
const QUANTITA = /esist|impeg|ordin|dispon|giac|qta|quant/i;

async function main() {
  const articoli = (argomento("articoli") ?? "")
    .split(",")
    .map((a) => a.trim().toUpperCase())
    .filter((a) => /^[\w.\-/]{1,50}$/.test(a));
  const cfg = leggiConfig();

  const out: string[] = [];
  const scrivi = (...r: string[]) => out.push(...r);
  const sezione = (t: string) => scrivi("", "=".repeat(90), t, "=".repeat(90));
  const adesso = new Date();
  const p2 = (n: number) => String(n).padStart(2, "0");
  const timbro = `${adesso.getFullYear()}${p2(adesso.getMonth() + 1)}${p2(adesso.getDate())}-${p2(adesso.getHours())}${p2(adesso.getMinutes())}${p2(adesso.getSeconds())}`;
  const cartella = join(CARTELLA, "esplorazione");
  const file = join(cartella, `giacenze-${timbro}.txt`);
  scrivi(`Ricognizione giacenze NTS (solo letture) - ${testo(adesso)} · articoli ${articoli.join(", ") || "-"}`);

  const pool = await new sql.ConnectionPool(configurazioneSql(cfg, "ShopDAV-EsploraGiacenze", { database: "DAVNTS", requestTimeout: 180000 })).connect();
  const q = <T extends Record<string, unknown>>(testoSql: string, par: Record<string, unknown> = {}) => {
    const r = pool.request();
    r.input("ditta", sql.VarChar(12), DITTA);
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
  type Oggetto = { id: number; schema_: string; nome: string; tipo: string; tipo_desc: string };

  try {
    sezione("1. Connessione e permessi");
    await prova("connessione", async () => {
      const r = await q<{ u: string; vd: number }>("SELECT SUSER_SNAME() AS u, HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'VIEW DEFINITION') AS vd");
      scrivi(`  login ${r[0].u} · VIEW DEFINITION: ${r[0].vd ? "sì" : "NO (definizioni vuote)"}`);
    });

    // 2 --------------------------------------------------------------------------------------
    sezione("2. Come la calcola Graphite (definizioni a cascata)");
    const tabelle = new Map<number, Oggetto>();
    const visti = new Set<number>();
    const coda: { id: number; livello: number }[] = [];
    for (const nome of OGGETTI_GRAPHITE) {
      await prova(nome, async () => {
        const r = await q<{ id: number | null }>("SELECT OBJECT_ID(@n) AS id", { n: nome });
        if (r[0]?.id) coda.push({ id: r[0].id, livello: 0 });
        else scrivi(`  ${nome}: non trovato`);
      });
    }
    while (coda.length && visti.size < 25) {
      const { id, livello } = coda.shift()!;
      if (visti.has(id)) continue;
      visti.add(id);
      await prova(`oggetto ${id}`, async () => {
        const o = (await q<Oggetto & { d: string | null }>(
          `SELECT o.object_id AS id, s.name AS schema_, o.name AS nome, RTRIM(o.type) AS tipo, o.type_desc AS tipo_desc, OBJECT_DEFINITION(o.object_id) AS d
             FROM sys.objects o JOIN sys.schemas s ON s.schema_id = o.schema_id WHERE o.object_id = @id`,
          { id },
        ))[0];
        if (!o) return;
        scrivi("", `---- ${o.schema_}.${o.nome} (${o.tipo_desc}, livello ${livello}) ----`, o.d ?? "(definizione non leggibile)");
        const dip = await q<Oggetto & { db: string | null }>(
          `SELECT DISTINCT d.referenced_id AS id, ISNULL(d.referenced_schema_name, 'dbo') AS schema_, d.referenced_entity_name AS nome,
                  RTRIM(ISNULL(x.type, '?')) AS tipo, ISNULL(x.type_desc, 'altro database o non risolto') AS tipo_desc, d.referenced_database_name AS db
             FROM sys.sql_expression_dependencies d LEFT JOIN sys.objects x ON x.object_id = d.referenced_id WHERE d.referencing_id = @id`,
          { id },
        );
        scrivi(`  usa: ${dip.map((x) => `${x.db ? x.db + "." : ""}${x.schema_}.${x.nome} [${x.tipo_desc}]`).join(", ") || "(niente)"}`);
        for (const x of dip) {
          if (x.id === null || x.db) continue;
          if (x.tipo === "U") tabelle.set(x.id, x);
          else if (["FN", "IF", "TF", "V", "P"].includes(x.tipo) && livello < 3) coda.push({ id: x.id, livello: livello + 1 });
        }
      });
    }

    // 3 --------------------------------------------------------------------------------------
    sezione("3. Magazzini e tabelle con nomi da giacenze o progressivi");
    await prova("tabmaga", async () => {
      const r = await q("SELECT * FROM tabmaga WHERE codditt = @ditta");
      scrivi("", "---- tabmaga (magazzini) ----", ...tabellaTesto(r, 50));
    });
    await prova("tabelle candidate", async () => {
      const par: Record<string, unknown> = {};
      MODELLI_TABELLE.forEach((m, i) => (par[`m${i}`] = m));
      const r = await q<Oggetto>(
        `SELECT o.object_id AS id, s.name AS schema_, o.name AS nome, RTRIM(o.type) AS tipo, o.type_desc AS tipo_desc
           FROM sys.objects o JOIN sys.schemas s ON s.schema_id = o.schema_id
          WHERE o.is_ms_shipped = 0 AND o.type IN ('U', 'V') AND (${MODELLI_TABELLE.map((_, i) => `o.name LIKE @m${i}`).join(" OR ")})`,
        par,
      );
      for (const o of r) if (!/^TT/i.test(o.nome)) tabelle.set(o.id, o);
    });
    const colonneDi = new Map<number, { colonna: string; tipo: string }[]>();
    for (const t of [...tabelle.values()].sort((a, b) => a.nome.localeCompare(b.nome))) {
      await prova(t.nome, async () => {
        const cols = await q<{ colonna: string; tipo: string; precisione: number; scala: number }>(
          "SELECT c.name AS colonna, TYPE_NAME(c.user_type_id) AS tipo, c.precision AS precisione, c.scale AS scala FROM sys.columns c WHERE c.object_id = @id ORDER BY c.column_id",
          { id: t.id },
        );
        colonneDi.set(t.id, cols);
        const n = await q<{ n: number }>("SELECT SUM(p.rows) AS n FROM sys.partitions p WHERE p.object_id = @id AND p.index_id IN (0, 1)", { id: t.id });
        scrivi("", `---- ${t.schema_}.${t.nome} (${t.tipo_desc}): ${n[0]?.n ?? "?"} righe ----`, ...tabellaTesto(cols, 300));
      });
    }

    // 4 --------------------------------------------------------------------------------------
    sezione("4. Totali per magazzino delle colonne di quantità");
    for (const t of tabelle.values()) {
      const cols = colonneDi.get(t.id) ?? [];
      const mag = cols.find((c) => /magaz$|_codmaga$|magazz/i.test(c.colonna))?.colonna;
      const qta = cols.filter((c) => QUANTITA.test(c.colonna) && ["decimal", "numeric", "float", "money", "int"].includes(c.tipo)).map((c) => c.colonna).slice(0, 8);
      if (!mag || !qta.length || t.tipo !== "U") continue;
      const ditta = cols.some((c) => c.colonna.toLowerCase() === "codditt") ? "WHERE codditt = @ditta" : "";
      await prova(`totali ${t.nome}`, async () => {
        const r = await q(
          `SELECT ${quota(mag)} AS magazzino, COUNT(*) AS righe, ${qta.map((c) => `SUM(IIF(${quota(c)} > 0, 1, 0)) AS ${quota(`positivi_${c}`)}, SUM(IIF(${quota(c)} < 0, 1, 0)) AS ${quota(`negativi_${c}`)}`).join(", ")}
             FROM ${quota(t.schema_)}.${quota(t.nome)} ${ditta} GROUP BY ${quota(mag)} ORDER BY 1`,
        );
        scrivi("", `---- ${t.nome}: righe con valori positivi / negativi, per magazzino ----`, ...tabellaTesto(r, 50));
      });
    }

    // 5 --------------------------------------------------------------------------------------
    sezione("5. Articoli di prova");
    if (!articoli.length) scrivi("  (salto: indicare --articoli COD1,COD2)");
    for (const t of tabelle.values()) {
      const cols = colonneDi.get(t.id) ?? [];
      const art = cols.filter((c) => /codart$|cod_art$|codice_art|^codart$/i.test(c.colonna)).map((c) => c.colonna);
      if (!articoli.length || !art.length) continue;
      await prova(`righe ${t.nome}`, async () => {
        const par: Record<string, unknown> = {};
        articoli.forEach((a, i) => (par[`a${i}`] = a));
        const lista = articoli.map((_, i) => `@a${i}`).join(", ");
        const r = await q(`SELECT TOP 60 * FROM ${quota(t.schema_)}.${quota(t.nome)} WHERE ${art.map((c) => `RTRIM(${quota(c)}) IN (${lista})`).join(" OR ")}`, par);
        if (r.length) scrivi("", `---- ${t.nome} ----`, ...tabellaTesto(r, 60));
      });
    }
    for (const nome of ["dbo.GPH_GIACENZE_UNI", "dbo.GPH_V_PROGRESSIVI_ARTICOLO"]) {
      if (!articoli.length) break;
      await prova(`vista ${nome}`, async () => {
        const cols = await q<{ c: string }>("SELECT name AS c FROM sys.columns WHERE object_id = OBJECT_ID(@n)", { n: nome });
        const art = cols.map((x) => x.c).filter((c) => /codart|cod_art|codice|articolo/i.test(c));
        if (!art.length) {
          scrivi("", `---- ${nome}: nessuna colonna articolo riconosciuta (colonne: ${cols.map((x) => x.c).join(", ")}) ----`);
          return;
        }
        const par: Record<string, unknown> = {};
        articoli.forEach((a, i) => (par[`a${i}`] = a));
        const lista = articoli.map((_, i) => `@a${i}`).join(", ");
        const r = await q(`SELECT TOP 60 * FROM ${nome} WHERE ${art.map((c) => `RTRIM(CAST(${quota(c)} AS varchar(60))) IN (${lista})`).join(" OR ")}`, par);
        scrivi("", `---- ${nome} ----`, ...tabellaTesto(r, 60));
      });
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
