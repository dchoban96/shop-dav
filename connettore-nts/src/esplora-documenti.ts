/**
 * `npm run esplora-documenti -- --clienti 140101656,140100402 --ddt 18931 --fattura 5113`
 *
 * Ricognizione SOLO LETTURE su DAVNTS per il brief "Documenti e pagamenti del cliente":
 * dove stanno DDT, fatture, note di credito, righe, riepilogo IVA, lotti, riferimenti DDT/ordine,
 * dati di trasporto, metodo di pagamento e scadenze (partite). Nessuna scrittura, mai.
 *
 * Scrive in esplorazione\documenti-AAAAMMGG-hhmmss.txt (fuori dal repo):
 *  1. connessione e permessi;
 *  2. testmag e movmag: colonne, righe, documenti per tipo e anno (ultimi 24 mesi), valori dei campi "tipo";
 *  3. tabelle con nomi da scadenze, pagamenti, IVA, lotti, trasporto, destinazioni, agenti: colonne e righe;
 *  4. colonne di tutto DAVNTS con parole chiave (scad, partit, lott, ddt, vett, colli, peso, …);
 *  5. query trovate nella cache dei piani di SQL Server che parlano di scadenze/partite o di testmag con
 *     lotti, castelletto IVA, vettori: sono quelle che Graphite e Business eseguono davvero;
 *  6. clienti di prova: anagrafica (senza fido, costi, note), pagamento, elenco documenti A/B/N, partite;
 *  7. documenti campione (DDT e fattura): testata intera, righe, righe delle tabelle collegate per chiave documento,
 *     somme delle righe per il controllo con la stampa di Business.
 * Serve un login con VIEW SERVER STATE per il punto 5 (sa): con shop_dav quella sezione è vuota.
 * Mai mostrate: colonne di costo, margine, provvigione, fido, note (vedi RISERVATE in esplorazione.ts).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sql from "mssql";
import { CARTELLA, DITTA, leggiConfig } from "./config.js";
import {
  chiaveDocumento,
  colonneAmmesse,
  colonneElencoTestate,
  colonneScadenza,
  MODELLO_OGGETTI_DOCUMENTI,
  PAROLE_COLONNE,
  quota,
  RISERVATE,
  tabellaTesto,
  testo,
  verticale,
} from "./esplorazione.js";
import { configurazioneSql } from "./nts.js";
import { messaggio } from "./registro.js";

type Oggetto = { id: number; schema_: string; nome: string; tipo: string; tipo_desc: string };
type Colonna = { colonna: string; tipo: string; precisione: number; scala: number; lunghezza: number };

function argomento(nome: string): string | null {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1].trim() : null;
}

function numeroOpzionale(nome: string): number | null {
  const v = argomento(nome);
  if (v === null) return null;
  if (!/^\d{1,9}$/.test(v)) throw new Error(`--${nome}: serve un numero intero`);
  return Number(v);
}

async function main() {
  const cfg = leggiConfig();
  const clienti = (argomento("clienti") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const c of clienti) if (!/^\d{1,10}$/.test(c)) throw new Error(`--clienti: "${c}" non è un codice conto NTS numerico`);
  const ddt = numeroOpzionale("ddt");
  const fattura = numeroOpzionale("fattura");
  const anno = numeroOpzionale("anno") ?? new Date().getFullYear();
  const mesi = numeroOpzionale("mesi") ?? 24;

  const out: string[] = [];
  const scrivi = (...righe: string[]) => out.push(...righe);
  const sezione = (titolo: string) => scrivi("", "=".repeat(90), titolo, "=".repeat(90));
  const adesso = new Date();
  const p2 = (n: number) => String(n).padStart(2, "0");
  const timbro = `${adesso.getFullYear()}${p2(adesso.getMonth() + 1)}${p2(adesso.getDate())}-${p2(adesso.getHours())}${p2(adesso.getMinutes())}${p2(adesso.getSeconds())}`;
  const cartella = join(CARTELLA, "esplorazione");
  const file = join(cartella, `documenti-${timbro}.txt`);

  scrivi(
    `Ricognizione documenti e scadenze NTS (solo letture) - ${testo(adesso)}`,
    `Clienti: ${clienti.join(", ") || "-"} · DDT ${ddt ?? "-"} · fattura ${fattura ?? "-"} · anno ${anno} · ultimi ${mesi} mesi`,
    `Colonne mai mostrate (riservate): ${RISERVATE.source}`,
  );

  const pool = await new sql.ConnectionPool(configurazioneSql(cfg, "ShopDAV-EsploraDocumenti", { database: "DAVNTS", requestTimeout: 180000 })).connect();
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
  const colonneDi = new Map<number, Colonna[]>();
  const colonne = async (t: Oggetto): Promise<Colonna[]> => {
    const c = colonneDi.get(t.id);
    if (c) return c;
    const r = await q<Colonna>(
      `SELECT c.name AS colonna, TYPE_NAME(c.user_type_id) AS tipo, c.precision AS precisione, c.scale AS scala, c.max_length AS lunghezza
         FROM sys.columns c WHERE c.object_id = @id ORDER BY c.column_id`,
      { id: t.id },
    );
    colonneDi.set(t.id, r);
    return r;
  };
  const nomi = (cols: Colonna[]) => cols.map((c) => c.colonna);
  const righeDi = async (t: Oggetto) => (await q<{ n: number }>("SELECT SUM(p.rows) AS n FROM sys.partitions p WHERE p.object_id = @id AND p.index_id IN (0, 1)", { id: t.id }))[0]?.n ?? null;
  const oggetto = async (nome: string): Promise<Oggetto | null> => {
    const r = await q<Oggetto>(
      `SELECT o.object_id AS id, s.name AS schema_, o.name AS nome, RTRIM(o.type) AS tipo, o.type_desc AS tipo_desc
         FROM sys.objects o JOIN sys.schemas s ON s.schema_id = o.schema_id WHERE o.object_id = OBJECT_ID(@nome)`,
      { nome },
    );
    return r[0] ?? null;
  };
  const nomeTab = (t: Oggetto) => `${quota(t.schema_)}.${quota(t.nome)}`;
  const haDitta = (cols: Colonna[]) => cols.some((c) => c.colonna.toLowerCase() === "codditt");
  const descriviTabella = async (t: Oggetto, mostraColonne = true) => {
    const cols = await colonne(t);
    const n = await righeDi(t);
    scrivi("", `---- ${t.schema_}.${t.nome} (${t.tipo_desc}): ${n ?? "?"} righe, ${cols.length} colonne ----`);
    if (mostraColonne) scrivi(...tabellaTesto(cols.filter((c) => !RISERVATE.test(c.colonna)) as unknown as Record<string, unknown>[], 400));
    const nascoste = cols.filter((c) => RISERVATE.test(c.colonna)).map((c) => c.colonna);
    if (nascoste.length) scrivi(`  (colonne riservate non mostrate: ${nascoste.join(", ")})`);
  };
  const dataDa = new Date(adesso.getFullYear(), adesso.getMonth() - mesi, 1);

  try {
    // 1 -----------------------------------------------------------------------------------
    sezione("1. Connessione e permessi");
    await prova("connessione", async () => {
      const r = await q<{ v: string; u: string; db: string; vd: number; vs: number }>(
        `SELECT CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(50)) AS v, SUSER_SNAME() AS u, DB_NAME() AS db,
                HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'VIEW DEFINITION') AS vd,
                HAS_PERMS_BY_NAME(NULL, NULL, 'VIEW SERVER STATE') AS vs`,
      );
      scrivi(`  SQL Server ${r[0].v} · login ${r[0].u} · database ${r[0].db} · VIEW DEFINITION: ${r[0].vd ? "sì" : "no"} · VIEW SERVER STATE: ${r[0].vs ? "sì" : "NO (sezione 5 vuota)"}`);
    });

    // 2 -----------------------------------------------------------------------------------
    sezione("2. testmag e movmag");
    const testmag = await oggetto("dbo.testmag");
    const movmag = await oggetto("dbo.movmag");
    for (const t of [testmag, movmag]) {
      if (!t) {
        scrivi("  tabella non trovata");
        continue;
      }
      await prova(t.nome, () => descriviTabella(t));
    }
    if (testmag) {
      const cols = nomi(await colonne(testmag));
      const ha = (c: string) => cols.some((x) => x.toLowerCase() === c);
      await prova("documenti per tipo e anno", async () => {
        if (!ha("tm_tipork") || !ha("tm_datdoc")) {
          scrivi("  (tm_tipork o tm_datdoc non trovate)");
          return;
        }
        const r = await q(
          `SELECT tm_tipork AS tipo, YEAR(tm_datdoc) AS anno, COUNT(*) AS documenti, MIN(tm_datdoc) AS dal, MAX(tm_datdoc) AS al,
                  COUNT(DISTINCT tm_conto) AS clienti
             FROM dbo.testmag WHERE codditt = @ditta AND tm_datdoc >= @da
            GROUP BY tm_tipork, YEAR(tm_datdoc) ORDER BY tm_tipork, YEAR(tm_datdoc)`,
          { ditta: DITTA, da: dataDa },
        );
        scrivi("", `---- documenti per tipo (tm_tipork) e anno, dal ${testo(dataDa)} ----`, ...tabellaTesto(r, 100));
        const mese = await q(
          `SELECT tm_tipork AS tipo, YEAR(tm_datdoc) AS anno, MONTH(tm_datdoc) AS mese, COUNT(*) AS documenti
             FROM dbo.testmag WHERE codditt = @ditta AND tm_datdoc >= @da AND tm_tipork IN ('A', 'B', 'N')
            GROUP BY tm_tipork, YEAR(tm_datdoc), MONTH(tm_datdoc) ORDER BY tm_tipork, YEAR(tm_datdoc), MONTH(tm_datdoc)`,
          { ditta: DITTA, da: dataDa },
        );
        scrivi("", "---- A/B/N per mese (per il confronto con Business al carico iniziale) ----", ...tabellaTesto(mese, 200));
      });
      await prova("valori dei campi tipo/causale/serie di testmag", async () => {
        const tipi = (await colonne(testmag)).filter(
          (c) => /tip|cau|fl|sezion|serie|stato|riv|codpag|codage|porto|valu|cat|zona/i.test(c.colonna) && !RISERVATE.test(c.colonna) && /char/.test(c.tipo) && c.lunghezza > 0 && c.lunghezza <= 20,
        );
        for (const c of tipi.slice(0, 25)) {
          const col = quota(c.colonna);
          const r = await q(
            `SELECT TOP 30 tm_tipork AS tipork, ${col} AS valore, COUNT(*) AS documenti
               FROM dbo.testmag WHERE codditt = @ditta AND tm_datdoc >= @da AND tm_tipork IN ('A', 'B', 'N')
              GROUP BY tm_tipork, ${col} ORDER BY tm_tipork, COUNT(*) DESC`,
            { ditta: DITTA, da: dataDa },
          );
          scrivi("", `---- testmag.${c.colonna} (${c.tipo}(${c.lunghezza})): valori distinti sui documenti A/B/N ----`, ...tabellaTesto(r, 30));
        }
      });
    }

    // 3 -----------------------------------------------------------------------------------
    sezione("3. Tabelle e viste con nomi da scadenze, pagamenti, IVA, lotti, trasporto, destinazioni, agenti");
    const candidati = new Map<number, Oggetto>();
    await prova("oggetti", async () => {
      const par: Record<string, unknown> = {};
      MODELLO_OGGETTI_DOCUMENTI.forEach((m, i) => (par[`m${i}`] = m));
      const cond = MODELLO_OGGETTI_DOCUMENTI.map((_, i) => `o.name LIKE @m${i}`).join(" OR ");
      const r = await q<Oggetto>(
        `SELECT o.object_id AS id, s.name AS schema_, o.name AS nome, RTRIM(o.type) AS tipo, o.type_desc AS tipo_desc
           FROM sys.objects o JOIN sys.schemas s ON s.schema_id = o.schema_id
          WHERE o.is_ms_shipped = 0 AND o.type IN ('U', 'V') AND o.name NOT LIKE 'GPH2%' AND o.name NOT LIKE 'provvig%' AND (${cond})
          ORDER BY o.type_desc, o.name`,
        par,
      );
      for (const o of r) candidati.set(o.id, o);
      scrivi(`  ${r.length} oggetti trovati: ${r.map((o) => o.nome).join(", ")}`);
    });
    for (const t of [...candidati.values()]) {
      if (t.id === testmag?.id || t.id === movmag?.id) continue;
      await prova(t.nome, async () => {
        const n = await righeDi(t);
        // Le viste e le tabelle vuote: solo il nome. Le tabelle con dati: colonne complete.
        await descriviTabella(t, t.tipo === "U" && (n ?? 0) > 0);
      });
    }

    // 4 -----------------------------------------------------------------------------------
    sezione("4. Colonne di tutto DAVNTS con parole chiave nel nome");
    const tabelleDaColonne = new Map<number, Oggetto>();
    await prova("colonne", async () => {
      const par: Record<string, unknown> = {};
      PAROLE_COLONNE.forEach((p, i) => (par[`p${i}`] = `%${p}%`));
      const cond = PAROLE_COLONNE.map((_, i) => `c.name LIKE @p${i}`).join(" OR ");
      const r = await q<{ id: number; tabella: string; tipo_ogg: string; colonna: string; tipo: string; lunghezza: number }>(
        `SELECT o.object_id AS id, o.name AS tabella, RTRIM(o.type) AS tipo_ogg, c.name AS colonna, TYPE_NAME(c.user_type_id) AS tipo, c.max_length AS lunghezza
           FROM sys.columns c JOIN sys.objects o ON o.object_id = c.object_id
          WHERE o.is_ms_shipped = 0 AND o.type IN ('U', 'V') AND o.name NOT LIKE 'GPH2%' AND o.name NOT LIKE 'provvig%' AND (${cond})
          ORDER BY o.name, c.column_id`,
        par,
      );
      const perTabella = new Map<string, string[]>();
      for (const x of r) {
        if (RISERVATE.test(x.colonna)) continue;
        const k = `${x.tabella} [${x.tipo_ogg}]`;
        perTabella.set(k, [...(perTabella.get(k) ?? []), `${x.colonna} ${x.tipo}${/char/.test(x.tipo) ? `(${x.lunghezza})` : ""}`]);
        if (x.tipo_ogg === "U" && !candidati.has(x.id)) tabelleDaColonne.set(x.id, { id: x.id, schema_: "dbo", nome: x.tabella, tipo: "U", tipo_desc: "USER_TABLE" });
      }
      for (const [tab, cols] of [...perTabella.entries()].sort()) scrivi(`  ${tab.padEnd(28)} ${cols.join(", ")}`);
      scrivi(`  (${perTabella.size} tabelle/viste)`);
    });

    // 5 -----------------------------------------------------------------------------------
    sezione("5. Query nella cache dei piani che parlano di scadenze/partite, o di testmag con lotti/IVA/vettori");
    await prova("cache dei piani", async () => {
      const r = await q<{ ultima: Date; esecuzioni: number; testo: string }>(
        `SELECT TOP 40 qs.last_execution_time AS ultima, qs.execution_count AS esecuzioni, SUBSTRING(st.text, 1, 2500) AS testo
           FROM sys.dm_exec_query_stats qs CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) st
          WHERE (st.dbid = DB_ID() OR st.dbid IS NULL) AND st.text NOT LIKE '%dm_exec%'
            AND (st.text LIKE '%scad%' OR st.text LIKE '%partit%' OR st.text LIKE '%insol%'
                 OR (st.text LIKE '%testmag%' AND (st.text LIKE '%lott%' OR st.text LIKE '%cast%' OR st.text LIKE '%vett%' OR st.text LIKE '%ddt%')))
          ORDER BY qs.last_execution_time DESC`,
      );
      if (!r.length) scrivi("  (nessuna query in cache con queste parole: riprovare subito dopo una ricezione dati del palmare o una stampa da Business)");
      for (const x of r) scrivi("", `---- ${testo(x.ultima)} · ${x.esecuzioni} esecuzioni ----`, x.testo.replace(/\s+/g, " ").trim());
    });

    // 6 -----------------------------------------------------------------------------------
    sezione("6. Clienti di prova");
    const anagra = await oggetto("dbo.anagra");
    const tabelleScadenze: { t: Oggetto; conto: string[]; data: string | null }[] = [];
    for (const t of [...candidati.values(), ...tabelleDaColonne.values()]) {
      if (t.tipo !== "U" || t.id === testmag?.id || t.id === movmag?.id || t.id === anagra?.id) continue;
      const cols = nomi(await colonne(t).catch(() => []));
      if (!/scad|partit|effet|incas|insol/i.test(t.nome) && !cols.some((c) => /scad/i.test(c))) continue;
      const s = colonneScadenza(cols);
      if (s.conto.length) tabelleScadenze.push({ t, ...s });
    }
    scrivi(`  tabelle candidate per le partite (hanno un conto cliente): ${tabelleScadenze.map((x) => `${x.t.nome} (${x.conto.join("/")}${x.data ? `, data ${x.data}` : ""})`).join("; ") || "nessuna"}`);
    if (!clienti.length) scrivi("  (salto: indicare --clienti)");
    for (const cliente of clienti) {
      scrivi("", `#### Cliente ${cliente} ####`);
      await prova(`anagra ${cliente}`, async () => {
        if (!anagra) return;
        const cols = colonneAmmesse(nomi(await colonne(anagra)));
        const r = await q(`SELECT ${cols.map(quota).join(", ")} FROM dbo.anagra WHERE codditt = @ditta AND an_conto = @c`, { ditta: DITTA, c: Number(cliente) });
        if (!r[0]) {
          scrivi("  cliente non trovato in anagra");
          return;
        }
        // Solo le colonne valorizzate: l'anagrafica ha centinaia di campi vuoti.
        const pieno = Object.fromEntries(Object.entries(r[0]).filter(([, v]) => v !== null && String(v).trim() !== "" && v !== 0));
        scrivi("---- anagra (colonne valorizzate, senza fido/costi/note) ----", ...verticale(pieno));
        // Pagamento: la tabella con una colonna *codpag e una descrizione
        const codpag = Object.keys(r[0]).find((k) => /codpag$/i.test(k));
        if (!codpag) return;
        for (const t of candidati.values()) {
          if (!/pag/i.test(t.nome) || t.tipo !== "U") continue;
          const tc = nomi(await colonne(t));
          const k = tc.find((c) => /codpag$/i.test(c));
          if (!k) continue;
          const rp = await q(`SELECT TOP 3 * FROM ${nomeTab(t)} WHERE ${haDitta(await colonne(t)) ? "codditt = @ditta AND " : ""}${quota(k)} = @v`, { ditta: DITTA, v: r[0][codpag] });
          scrivi("", `---- pagamento del cliente: ${t.nome} con ${k} = ${testo(r[0][codpag])} ----`, ...tabellaTesto(rp.map((x) => Object.fromEntries(Object.entries(x).filter(([kk]) => !RISERVATE.test(kk)))), 3));
        }
      });
      await prova(`documenti di ${cliente}`, async () => {
        if (!testmag) return;
        const cols = colonneElencoTestate(nomi(await colonne(testmag)));
        const r = await q(
          `SELECT TOP 60 ${cols.map(quota).join(", ")} FROM dbo.testmag
            WHERE codditt = @ditta AND tm_conto = @c AND tm_tipork IN ('A', 'B', 'N') AND tm_datdoc >= @da
            ORDER BY tm_datdoc DESC, tm_numdoc DESC`,
          { ditta: DITTA, c: Number(cliente), da: dataDa },
        );
        const conteggio = await q(
          `SELECT tm_tipork AS tipo, COUNT(*) AS documenti FROM dbo.testmag WHERE codditt = @ditta AND tm_conto = @c AND tm_datdoc >= @da GROUP BY tm_tipork ORDER BY tm_tipork`,
          { ditta: DITTA, c: Number(cliente), da: dataDa },
        );
        scrivi("", `---- documenti per tipo dal ${testo(dataDa)} ----`, ...tabellaTesto(conteggio));
        scrivi("", "---- ultimi 60 documenti A/B/N (confrontare con l'elenco in Business) ----", ...tabellaTesto(r, 60));
      });
      for (const { t, conto, data } of tabelleScadenze) {
        await prova(`${t.nome} di ${cliente}`, async () => {
          const cols = await colonne(t);
          const visibili = colonneAmmesse(nomi(cols));
          const cond = conto.map((c) => `${quota(c)} = @c`).join(" OR ");
          const ordina = data ? `ORDER BY ${quota(data)} DESC` : "";
          const r = await q(`SELECT TOP 40 ${visibili.map(quota).join(", ")} FROM ${nomeTab(t)} WHERE ${haDitta(cols) ? "codditt = @ditta AND " : ""}(${cond}) ${ordina}`, { ditta: DITTA, c: Number(cliente) });
          scrivi("", `---- ${t.nome}: righe del cliente (confrontare con lo scadenzario/partite in Business) ----`, ...tabellaTesto(r, 40));
        });
      }
    }

    // 7 -----------------------------------------------------------------------------------
    sezione("7. Documenti campione");
    const campioni: { titolo: string; tipork: string; numero: number }[] = [];
    if (ddt !== null) campioni.push({ titolo: `DDT ${ddt}/${anno}`, tipork: "B", numero: ddt });
    if (fattura !== null) campioni.push({ titolo: `Fattura ${fattura}/${anno}`, tipork: "A", numero: fattura });
    if (!campioni.length) scrivi("  (salto: indicare --ddt e/o --fattura)");
    const collegate = [...candidati.values(), ...tabelleDaColonne.values()].filter((t) => t.tipo === "U" && t.id !== testmag?.id && t.id !== movmag?.id);
    for (const c of campioni) {
      scrivi("", `#### ${c.titolo} (tm_tipork = '${c.tipork}') ####`);
      if (!testmag || !movmag) continue;
      type Testata = Record<string, unknown> & { tm_anno: number; tm_serie: string; tm_numdoc: number };
      let testate: Testata[] = [];
      await prova(`testata ${c.titolo}`, async () => {
        const cols = colonneAmmesse(nomi(await colonne(testmag)));
        testate = await q<Testata>(`SELECT ${cols.map(quota).join(", ")} FROM dbo.testmag WHERE codditt = @ditta AND tm_tipork = @t AND tm_anno = @a AND tm_numdoc = @n ORDER BY tm_serie`, {
          ditta: DITTA,
          t: c.tipork,
          a: anno,
          n: c.numero,
        });
        if (!testate.length) {
          scrivi(`  nessuna testata con tm_tipork='${c.tipork}', tm_anno=${anno}, tm_numdoc=${c.numero} (controllare anno e serie)`);
          return;
        }
        for (const t of testate) scrivi("", `---- testmag (serie '${String(t.tm_serie ?? "").trim()}'), colonne valorizzate ----`, ...verticale(Object.fromEntries(Object.entries(t).filter(([, v]) => v !== null && String(v).trim() !== ""))));
      });
      for (const t of testate) {
        const serie = String(t.tm_serie ?? "");
        const par = { ditta: DITTA, t: c.tipork, a: anno, s: serie, n: c.numero };
        await prova(`righe ${c.titolo}`, async () => {
          const cols = colonneAmmesse(nomi(await colonne(movmag)));
          const r = await q(
            `SELECT ${cols.map(quota).join(", ")} FROM dbo.movmag WHERE codditt = @ditta AND mm_tipork = @t AND mm_anno = @a AND mm_serie = @s AND mm_numdoc = @n ORDER BY 1`,
            par,
          );
          scrivi("", `---- movmag: ${r.length} righe (ordinate per la prima colonna) ----`);
          // Prima riga in verticale (per leggere tutti i campi), poi tutte le righe con le colonne valorizzate in almeno una riga.
          if (r[0]) scrivi("  prima riga, tutte le colonne:", ...verticale(r[0]));
          const piene = cols.filter((k) => r.some((x) => x[k] !== null && String(x[k]).trim() !== "" && x[k] !== 0));
          scrivi("", `  tutte le righe, colonne valorizzate (${piene.length}):`, ...tabellaTesto(r.map((x) => Object.fromEntries(piene.map((k) => [k, x[k]]))), 120));
          const numeriche = (await colonne(movmag)).filter((k) => /decimal|numeric|float|money|int/.test(k.tipo) && !RISERVATE.test(k.colonna) && /val|imp|iva|quant|colli|peso|tot/i.test(k.colonna));
          if (numeriche.length) {
            const somme = await q(
              `SELECT ${numeriche.map((k) => `SUM(${quota(k.colonna)}) AS ${quota(k.colonna)}`).join(", ")} FROM dbo.movmag WHERE codditt = @ditta AND mm_tipork = @t AND mm_anno = @a AND mm_serie = @s AND mm_numdoc = @n`,
              par,
            );
            scrivi("", "  somme delle righe (confrontare con imponibile, IVA, totale, colli, peso della stampa):", ...verticale(somme[0] ?? {}));
          }
        });
        for (const tab of collegate) {
          await prova(`${tab.nome} per ${c.titolo}`, async () => {
            const cols = await colonne(tab);
            const k = chiaveDocumento(nomi(cols));
            if (!k) return;
            const cond = [`${quota(k.anno)} = @a`, `${quota(k.numdoc)} = @n`, ...(k.tipork ? [`${quota(k.tipork)} = @t`] : []), ...(k.serie ? [`${quota(k.serie)} = @s`] : [])];
            const visibili = colonneAmmesse(nomi(cols));
            const r = await q(`SELECT TOP 80 ${visibili.map(quota).join(", ")} FROM ${nomeTab(tab)} WHERE ${haDitta(cols) ? "codditt = @ditta AND " : ""}${cond.join(" AND ")}`, par);
            if (!r.length) return;
            scrivi("", `---- ${tab.nome}: ${r.length} righe collegate al documento (chiave ${[k.tipork, k.anno, k.serie, k.numdoc].filter(Boolean).join(", ")}) ----`, ...tabellaTesto(r, 80));
          });
        }
      }
    }
  } finally {
    await pool.close();
    mkdirSync(cartella, { recursive: true });
    writeFileSync(file, "﻿" + out.join("\r\n") + "\r\n", "utf8");
  }
  console.log(out.join("\n"));
  console.log(`\nSalvato in ${file}\nMandare questo file (resta fuori dal repo): contiene dati dei clienti di prova.`);
}

main().catch((e) => {
  console.error(messaggio(e));
  process.exit(1);
});
