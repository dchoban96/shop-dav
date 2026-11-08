/**
 * `npm run esplora-prezzi -- --cliente 140100000 --articolo CODICE`: ricognizione SOLO LETTURE
 * su DAVNTS per progettare l'import di listino 2 e sconti cliente (nessuna scrittura, mai).
 *
 * Scrive in esplorazione\prezzi-AAAAMMGG-hhmmss.txt (fuori dal repo):
 *  1. login, versione, permessi;
 *  2. oggetti con nomi da listini/sconti/prezzi/Graphite;
 *  3. la funzione prezzo di Graphite (default dbo.FNMG_GPH_PREZZO_LISTART2): parametri e definizione;
 *  4. le sue dipendenze, a cascata: definizioni di funzioni e viste, elenco delle tabelle;
 *  5. colonne e numero di righe delle tabelle trovate;
 *  6. caso di prova: righe di quelle tabelle per l'articolo e il cliente dati, e la funzione chiamata su di loro;
 *  7. colonne prezzo/sconto della frontiera (GPH_RIGA_NTS), per i decimali.
 * Serve un login con VIEW DEFINITION su DAVNTS (sa): con shop_dav le definizioni risultano vuote.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sql from "mssql";
import { CARTELLA, DITTA, leggiConfig } from "./config.js";
import { colonneChiave, colonnePrezzi, MODELLO_OGGETTI, quota, tabellaTesto, testo, valorePerParametro, type CasoProva } from "./esplorazione.js";
import { configurazioneSql } from "./nts.js";
import { messaggio } from "./registro.js";

type Oggetto = { id: number; schema_: string; nome: string; tipo: string; tipo_desc: string };

function argomento(nome: string): string | null {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1].trim() : null;
}

async function main() {
  const cfg = leggiConfig();
  const clienteArg = argomento("cliente");
  const articolo = argomento("articolo")?.toUpperCase() ?? null;
  const funzione = argomento("funzione") ?? "dbo.FNMG_GPH_PREZZO_LISTART2";
  const listino = Number(argomento("listino") ?? 2);
  if (clienteArg && !/^\d{1,10}$/.test(clienteArg)) throw new Error("--cliente: serve il codice conto NTS numerico");
  if (!/^([A-Za-z_]\w*\.)?[A-Za-z_]\w*$/.test(funzione)) throw new Error("--funzione: nome non valido (es. dbo.FNMG_GPH_PREZZO_LISTART2)");
  const cliente = clienteArg ? Number(clienteArg) : null;

  const out: string[] = [];
  const scrivi = (...righe: string[]) => out.push(...righe);
  const sezione = (titolo: string) => scrivi("", "=".repeat(90), titolo, "=".repeat(90));
  const adesso = new Date();
  const p2 = (n: number) => String(n).padStart(2, "0");
  const timbro = `${adesso.getFullYear()}${p2(adesso.getMonth() + 1)}${p2(adesso.getDate())}-${p2(adesso.getHours())}${p2(adesso.getMinutes())}${p2(adesso.getSeconds())}`;
  const cartella = join(CARTELLA, "esplorazione");
  const file = join(cartella, `prezzi-${timbro}.txt`);

  scrivi(`Ricognizione prezzi NTS (solo letture) - ${testo(adesso)}`, `Funzione: ${funzione} · listino ${listino} · cliente ${cliente ?? "-"} · articolo ${articolo ?? "-"}`);

  const pool = await new sql.ConnectionPool(configurazioneSql(cfg, "ShopDAV-EsploraPrezzi", { database: "DAVNTS", requestTimeout: 120000 })).connect();
  const q = <T extends Record<string, unknown>>(testoSql: string, par: Record<string, unknown> = {}) => {
    const r = pool.request();
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

  try {
    // 1 -----------------------------------------------------------------------------------
    sezione("1. Connessione e permessi");
    await prova("connessione", async () => {
      const r = await q<{ v: string; u: string; db: string; vd: number }>(
        "SELECT CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(50)) AS v, SUSER_SNAME() AS u, DB_NAME() AS db, HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'VIEW DEFINITION') AS vd",
      );
      scrivi(`  SQL Server ${r[0].v} · login ${r[0].u} · database ${r[0].db} · VIEW DEFINITION: ${r[0].vd ? "sì" : "NO (le definizioni saranno vuote)"}`);
    });

    // 2 -----------------------------------------------------------------------------------
    sezione("2. Oggetti con nomi da listini, sconti, prezzi, Graphite");
    const candidati: Oggetto[] = [];
    await prova("oggetti", async () => {
      const par: Record<string, unknown> = {};
      MODELLO_OGGETTI.forEach((m, i) => (par[`m${i}`] = m));
      const cond = MODELLO_OGGETTI.map((_, i) => `o.name LIKE @m${i}`).join(" OR ");
      const r = await q<Oggetto & { modificato: Date }>(
        `SELECT o.object_id AS id, s.name AS schema_, o.name AS nome, RTRIM(o.type) AS tipo, o.type_desc AS tipo_desc, o.modify_date AS modificato
           FROM sys.objects o JOIN sys.schemas s ON s.schema_id = o.schema_id
          WHERE o.is_ms_shipped = 0 AND o.type IN ('U','V','FN','IF','TF','P') AND (${cond})
          ORDER BY o.type_desc, o.name`,
        par,
      );
      candidati.push(...r);
      scrivi(...tabellaTesto(r.map(({ schema_, nome, tipo_desc, modificato }) => ({ oggetto: `${schema_}.${nome}`, tipo: tipo_desc, modificato })), 300));
    });

    // 3 -----------------------------------------------------------------------------------
    sezione(`3. Funzione ${funzione}`);
    let principale: Oggetto | null = null;
    const parametri: { nome: string; tipo: string; lunghezza: number; precisione: number; scala: number }[] = [];
    await prova("funzione", async () => {
      const r = await q<Oggetto>(
        `SELECT o.object_id AS id, s.name AS schema_, o.name AS nome, RTRIM(o.type) AS tipo, o.type_desc AS tipo_desc
           FROM sys.objects o JOIN sys.schemas s ON s.schema_id = o.schema_id WHERE o.object_id = OBJECT_ID(@nome)`,
        { nome: funzione },
      );
      if (!r.length) {
        scrivi("  funzione non trovata in DAVNTS");
        return;
      }
      principale = r[0];
      const pr = await q<{ nome: string; tipo: string; lunghezza: number; precisione: number; scala: number }>(
        `SELECT p.name AS nome, TYPE_NAME(p.user_type_id) AS tipo, p.max_length AS lunghezza, p.precision AS precisione, p.scale AS scala
           FROM sys.parameters p WHERE p.object_id = @id AND p.parameter_id > 0 ORDER BY p.parameter_id`,
        { id: principale.id },
      );
      parametri.push(...pr);
      const ritorno = await q<{ tipo: string; precisione: number; scala: number }>(
        "SELECT TYPE_NAME(p.user_type_id) AS tipo, p.precision AS precisione, p.scale AS scala FROM sys.parameters p WHERE p.object_id = @id AND p.parameter_id = 0",
        { id: principale.id },
      );
      scrivi(`  tipo ${principale.tipo_desc}${ritorno[0] ? ` · restituisce ${ritorno[0].tipo}(${ritorno[0].precisione},${ritorno[0].scala})` : ""}`, "  parametri:");
      scrivi(...tabellaTesto(pr));
    });

    // 4 -----------------------------------------------------------------------------------
    sezione("4. Definizioni e dipendenze (a cascata)");
    const tabelle = new Map<number, Oggetto>();
    await prova("dipendenze", async () => {
      if (!principale) {
        scrivi("  (salto: funzione non trovata)");
        return;
      }
      const visti = new Set<number>();
      const coda: { o: Oggetto; livello: number }[] = [{ o: principale, livello: 0 }];
      while (coda.length && visti.size < 30) {
        const { o, livello } = coda.shift()!;
        if (visti.has(o.id)) continue;
        visti.add(o.id);
        const def = await q<{ d: string | null }>("SELECT OBJECT_DEFINITION(@id) AS d", { id: o.id });
        scrivi("", `---- ${o.schema_}.${o.nome} (${o.tipo_desc}, livello ${livello}) ----`, def[0]?.d ?? "(definizione non leggibile: serve VIEW DEFINITION)");
        const dip = await q<Oggetto & { db: string | null }>(
          `SELECT DISTINCT d.referenced_id AS id, ISNULL(d.referenced_schema_name, 'dbo') AS schema_, d.referenced_entity_name AS nome,
                  RTRIM(ISNULL(o.type, '?')) AS tipo, ISNULL(o.type_desc, 'altro database o non risolto') AS tipo_desc, d.referenced_database_name AS db
             FROM sys.sql_expression_dependencies d LEFT JOIN sys.objects o ON o.object_id = d.referenced_id
            WHERE d.referencing_id = @id`,
          { id: o.id },
        );
        scrivi(`  usa: ${dip.map((x) => `${x.db ? x.db + "." : ""}${x.schema_}.${x.nome} [${x.tipo_desc}]`).join(", ") || "(niente)"}`);
        for (const x of dip) {
          if (x.id === null || x.db) continue;
          if (x.tipo === "U") tabelle.set(x.id, x);
          else if (["FN", "IF", "TF", "V", "P"].includes(x.tipo) && livello < 4) coda.push({ o: x, livello: livello + 1 });
        }
      }
    });
    for (const c of candidati) if (c.tipo === "U") tabelle.set(c.id, c);
    // anagra e artico servono comunque per il caso di prova (solo colonne dei prezzi)
    await prova("anagra/artico", async () => {
      const r = await q<Oggetto>(
        `SELECT o.object_id AS id, s.name AS schema_, o.name AS nome, RTRIM(o.type) AS tipo, o.type_desc AS tipo_desc
           FROM sys.objects o JOIN sys.schemas s ON s.schema_id = o.schema_id WHERE o.object_id IN (OBJECT_ID('dbo.anagra'), OBJECT_ID('dbo.artico'), OBJECT_ID('dbo.tabcfam'))`,
      );
      for (const o of r) tabelle.set(o.id, o);
    });

    // 5 -----------------------------------------------------------------------------------
    sezione("5. Tabelle: colonne e numero di righe");
    const colonneDi = new Map<number, string[]>();
    for (const t of [...tabelle.values()].sort((a, b) => a.nome.localeCompare(b.nome))) {
      await prova(t.nome, async () => {
        const cols = await q<{ colonna: string; tipo: string; precisione: number; scala: number; lunghezza: number }>(
          `SELECT c.name AS colonna, TYPE_NAME(c.user_type_id) AS tipo, c.precision AS precisione, c.scale AS scala, c.max_length AS lunghezza
             FROM sys.columns c WHERE c.object_id = @id ORDER BY c.column_id`,
          { id: t.id },
        );
        colonneDi.set(t.id, cols.map((c) => c.colonna));
        const n = await q<{ n: number }>("SELECT SUM(p.rows) AS n FROM sys.partitions p WHERE p.object_id = @id AND p.index_id IN (0, 1)", { id: t.id });
        const anagrafiche = /^(anagra|artico)$/i.test(t.nome);
        scrivi("", `---- ${t.schema_}.${t.nome}: ${n[0]?.n ?? "?"} righe, ${cols.length} colonne${anagrafiche ? " (mostrate solo quelle utili ai prezzi)" : ""} ----`);
        const visibili = anagrafiche ? cols.filter((c) => colonnePrezzi([c.colonna], t.nome.toLowerCase() as "anagra" | "artico").length) : cols;
        scrivi(...tabellaTesto(visibili, 400));
      });
    }

    // 6 -----------------------------------------------------------------------------------
    sezione("6. Caso di prova");
    if (!cliente && !articolo) {
      scrivi("  (salto: indicare --cliente e --articolo)");
    } else {
      let um: string | null = null;
      for (const t of tabelle.values()) {
        const cols = colonneDi.get(t.id);
        if (!cols?.length) continue;
        await prova(`righe di ${t.nome}`, async () => {
          const nomeT = t.nome.toLowerCase();
          const ha = (c: string) => cols.some((x) => x.toLowerCase() === c);
          const ditta = ha("codditt") ? "codditt = @ditta AND " : "";
          const tab = `${quota(t.schema_)}.${quota(t.nome)}`;
          if (nomeT === "anagra" || nomeT === "artico") {
            const scelte = colonnePrezzi(cols, nomeT);
            const [chiave, valore] = nomeT === "anagra" ? ["an_conto", cliente] : ["ar_codart", articolo];
            if (valore === null || !ha(chiave)) return;
            const r = await q(`SELECT ${scelte.map(quota).join(", ")} FROM ${tab} WHERE ${ditta}${quota(chiave)} = @v`, { ditta: DITTA, v: valore });
            scrivi("", `---- ${t.nome} (${chiave} = ${valore}) ----`, ...tabellaTesto(r));
            if (nomeT === "artico" && r[0] && "ar_unmis" in r[0]) um = testo(r[0].ar_unmis);
            return;
          }
          const k = colonneChiave(cols);
          const filtri: [string, string, unknown][] = [];
          if (articolo && k.articolo.length) filtri.push([`articolo ${articolo}`, k.articolo.map((c) => `${quota(c)} = @art`).join(" OR "), articolo]);
          if (cliente !== null && k.cliente.length) filtri.push([`cliente ${cliente}`, k.cliente.map((c) => `${quota(c)} = @cli`).join(" OR "), cliente]);
          for (const [descr, cond] of filtri) {
            const r = await q(`SELECT TOP 40 * FROM ${tab} WHERE ${ditta}(${cond})`, { ditta: DITTA, art: articolo, cli: cliente });
            scrivi("", `---- ${t.nome}, righe per ${descr} ----`, ...tabellaTesto(r, 40));
          }
        });
      }

      await prova("chiamata della funzione", async () => {
        const f = principale as Oggetto | null;
        if (!f) return;
        const caso: CasoProva = { cliente, articolo, um, listino, ditta: DITTA, oggi: new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate()) };
        const par: Record<string, unknown> = {};
        const spiegazioni: string[] = [];
        parametri.forEach((p, i) => {
          const v = valorePerParametro(p, caso);
          par[`p${i}`] = v ? v.valore : null;
          spiegazioni.push(`${p.nome} (${p.tipo}) = ${v ? `${testo(v.valore)}  [${v.motivo}]` : "NULL  [nome non riconosciuto: da indicare a mano]"}`);
        });
        const argomenti = parametri.map((_, i) => `@p${i}`).join(", ");
        const nomeF = `${quota(f.schema_)}.${quota(f.nome)}`;
        const testoSql = f.tipo === "FN" ? `SELECT ${nomeF}(${argomenti}) AS risultato` : `SELECT * FROM ${nomeF}(${argomenti})`;
        scrivi("", `---- chiamata: ${testoSql.replace(/@p(\d+)/g, (_, i) => testo(par[`p${i}`]))} ----`, ...spiegazioni.map((s) => `  ${s}`));
        const r = await q(testoSql, par);
        scrivi("  risultato:", ...tabellaTesto(r));
        scrivi("  Confrontare con il prezzo che Business propone per questo cliente e articolo.");
      });
    }

    // 7 -----------------------------------------------------------------------------------
    sezione("7. Frontiera: colonne prezzo, sconti e quantità di GPH_RIGA_NTS");
    await prova("frontiera", async () => {
      const r = await q(
        `SELECT c.name AS colonna, t.name AS tipo, c.precision AS precisione, c.scale AS scala
           FROM NTS_FRONTIERA.sys.columns c JOIN NTS_FRONTIERA.sys.types t ON t.user_type_id = c.user_type_id
          WHERE c.object_id = OBJECT_ID('NTS_FRONTIERA.dbo.GPH_RIGA_NTS') AND c.name IN ('PREZZO','SCONTO1','SCONTO2','QUANTITA')`,
      );
      scrivi(...tabellaTesto(r));
    });
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
