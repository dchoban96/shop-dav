/**
 * `npm run importa-prezzi [-- --scrivi] [--cliente 140100000] [--articolo CODICE] [--giorni 300]`
 *
 * Porta nello shop i prezzi come li vede il cliente in NTS (regole in prezzi.ts):
 *  - listini_nts: listino per articolo e numero (al centesimo) con gli sconti di listino;
 *  - clienti.listino_nts: listino del cliente in anagrafica;
 *  - condizioni_cliente: storico (prezzo speciale o sconti sul listino di oggi), prezzi personali e
 *    sconti cliente × articolo di NTS, sconti generali in anagrafica.
 * Su NTS solo letture. SENZA --scrivi non tocca Supabase: scrive solo il rapporto
 * esplorazione\import-prezzi-AAAAMMGG-hhmmss.txt. Con --scrivi richiede la migrazione 0010.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import sql from "mssql";
import { CARTELLA, DITTA, leggiConfig } from "./config.js";
import { tabellaTesto, testo } from "./esplorazione.js";
import { configurazioneSql } from "./nts.js";
import { scontoComplessivo, SOGLIA_SCONTO } from "./regole.js";
import { centesimi, combinaSconti, listinoCliente, risolvi, type Condizione, type PrezzoPersonale, type RigaStorico, type ScontoCliente } from "./prezzi.js";
import { messaggio } from "./registro.js";

function argomento(nome: string): string | null {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1].trim() : null;
}

const CLIENTI = "BETWEEN 140000000 AND 149999999";
const ORIGINI_IMPORT = ["vendite", "storico_ps", "storico_sconto", "nts_prezzo", "nts_sconto", "nts_generale"];
const chiave = (c: string) => String(c ?? "").trim().toUpperCase();
const data = (d: unknown): Date | null => (d instanceof Date && d.getFullYear() > 1950 ? d : null);
const iso = (d: Date | null) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : null);
const sconti6 = (r: Record<string, unknown>) => [1, 2, 3, 4, 5, 6].map((i) => Number(r[`sc${i}`] ?? 0) || 0);

async function main() {
  const scrivere = process.argv.includes("--scrivi");
  const clienteDettaglio = argomento("cliente");
  const articoloDettaglio = argomento("articolo")?.toUpperCase() ?? null;
  const giorni = Number(argomento("giorni") ?? 300);
  if (!(giorni > 0 && giorni <= 1000)) throw new Error("--giorni: tra 1 e 1000");
  const cfg = leggiConfig();

  const out: string[] = [];
  const scrivi = (...r: string[]) => out.push(...r);
  const sezione = (t: string) => scrivi("", "=".repeat(90), t, "=".repeat(90));
  const adesso = new Date();
  const oggi = new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate());
  const dal = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() - giorni);
  const p2 = (n: number) => String(n).padStart(2, "0");
  const timbro = `${adesso.getFullYear()}${p2(adesso.getMonth() + 1)}${p2(adesso.getDate())}-${p2(adesso.getHours())}${p2(adesso.getMinutes())}${p2(adesso.getSeconds())}`;
  const cartella = join(CARTELLA, "esplorazione");
  const file = join(cartella, `import-prezzi-${timbro}.txt`);
  scrivi(`Import prezzi da NTS - ${testo(adesso)} - ${scrivere ? "SCRITTURA in Supabase" : "PROVA (Supabase non viene toccato)"} - storico ${giorni} giorni`);

  const db = createClient(cfg.supabase.url, cfg.supabase.chiave, { auth: { persistSession: false, autoRefreshToken: false } });
  const pool = await new sql.ConnectionPool(configurazioneSql(cfg, "ShopDAV-ImportaPrezzi", { database: "DAVNTS", requestTimeout: 300000 })).connect();
  const q = async <T extends Record<string, unknown>>(testoSql: string) => {
    const r = pool.request();
    r.input("ditta", sql.VarChar(12), DITTA);
    r.input("oggi", sql.DateTime, oggi);
    r.input("dal", sql.DateTime, dal);
    return (await r.query<T>(testoSql)).recordset as T[];
  };

  try {
    // 1. Shop: articoli e clienti reali ----------------------------------------------------
    const articoliShop = new Map<string, string>(); // chiave → cod_dav dello shop
    for (let da = 0; ; da += 1000) {
      const { data: righe, error } = await db.from("articoli").select("cod_dav").range(da, da + 999);
      if (error) throw new Error(`articoli dello shop: ${error.message}`);
      for (const r of righe ?? []) articoliShop.set(chiave(r.cod_dav), r.cod_dav);
      if (!righe || righe.length < 1000) break;
    }
    const clientiShop = new Map<number, number>(); // conto NTS → id shop
    for (let da = 0; ; da += 1000) {
      const { data: righe, error } = await db.from("clienti").select("id, codice_nts").eq("demo", false).range(da, da + 999);
      if (error) throw new Error(`clienti dello shop: ${error.message}`);
      for (const r of righe ?? []) if (/^\d+$/.test(String(r.codice_nts).trim())) clientiShop.set(Number(r.codice_nts), r.id);
      if (!righe || righe.length < 1000) break;
    }

    // 2. NTS: colonne facoltative di movord / movmag ----------------------------------------
    const colonneDi = async (tab: string) =>
      new Set((await q<{ n: string }>(`SELECT LOWER(name) AS n FROM sys.columns WHERE object_id = OBJECT_ID('dbo.${tab}')`)).map((r) => r.n));
    const colOrd = await colonneDi("movord");
    const colMag = await colonneDi("movmag");
    const scontiSql = (pref: string, cols: Set<string>) => [1, 2, 3, 4, 5, 6].map((i) => (cols.has(`${pref}_scont${i}`) ? `m.${pref}_scont${i} AS sc${i}` : `0 AS sc${i}`)).join(", ");
    // Omaggi (sconto 100 % su uno qualsiasi degli sconti): non sono un prezzo praticato, si saltano
    // e vale la riga venduta precedente (import del 10/11 09:24: 1.540 condizioni oltre il 20 %, molte a −100 %).
    // Omaggi con rivalsa: stesso prezzo, sconto 0, ma mm_stasino / mo_stasino = 'O' (TipoOmaggio=O in Graphite;
    // visto sul DDT 19602, riga DOLMAS "4+2"). Anche questi si saltano: altrimenti toglierebbero lo sconto abituale.
    const nonOmaggioSql = (pref: string, cols: Set<string>) =>
      [
        ...[1, 2, 3, 4, 5, 6].filter((i) => cols.has(`${pref}_scont${i}`)).map((i) => `AND ISNULL(m.${pref}_scont${i}, 0) < 100`),
        ...(cols.has(`${pref}_stasino`) ? [`AND ISNULL(m.${pref}_stasino, '') <> 'O'`] : []),
      ].join(" ");
    const umSql = (pref: string, cols: Set<string>) => (cols.has(`${pref}_unmis`) ? `AND (RTRIM(ISNULL(m.${pref}_unmis, '')) = '' OR m.${pref}_unmis = a.ar_unmis)` : "");

    // 3. NTS: letture ------------------------------------------------------------------------
    const anagra = await q<{ an_conto: number; an_listino: number; an_scont1: number; an_scont2: number }>(
      `SELECT an_conto, an_listino, an_scont1, an_scont2 FROM anagra WHERE codditt = @ditta AND an_conto ${CLIENTI}`,
    );
    const listini = await q<{ codart: string; listino: number; prezzo: number; datagg: Date }>(
      `SELECT codart, listino, prezzo, datagg FROM (
         SELECT lc_codart AS codart, lc_listino AS listino, lc_prezzo AS prezzo, lc_datagg AS datagg,
                ROW_NUMBER() OVER (PARTITION BY lc_codart, lc_listino ORDER BY lc_datagg DESC, lc_progr DESC) AS n
           FROM listini
          WHERE codditt = @ditta AND lc_conto = 0 AND lc_listino > 0 AND lc_coddest = 0 AND lc_codlavo = 0 AND lc_codvalu = 0
            AND lc_codtpro = 0 AND lc_fase = 0 AND RTRIM(ISNULL(lc_codcas, '')) = ''
            AND @oggi BETWEEN lc_datagg AND lc_datscad AND 1 BETWEEN lc_daquant AND lc_aquant) x
        WHERE n = 1`,
    );
    const scontiListino = await q<Record<string, unknown> & { codart: string; listino: number }>(
      `SELECT codart, listino, sc1, sc2, sc3, sc4, sc5, sc6 FROM (
         SELECT so_codart AS codart, so_clscan AS listino, so_scont1 AS sc1, so_scont2 AS sc2, so_scont3 AS sc3, so_scont4 AS sc4, so_scont5 AS sc5, so_scont6 AS sc6,
                ROW_NUMBER() OVER (PARTITION BY so_codart, so_clscan ORDER BY so_datagg DESC) AS n
           FROM sconti
          WHERE codditt = @ditta AND so_conto = 0 AND so_clscan > 0 AND RTRIM(ISNULL(so_codart, '')) <> '' AND RTRIM(ISNULL(so_codcfam, '')) = ''
            AND so_clscar = 0 AND so_coddest = 0 AND so_codtpro = 0 AND @oggi BETWEEN so_datagg AND so_datscad AND so_daquant <= 1 AND so_aquant >= 1) x
        WHERE n = 1`,
    );
    const personali = await q<{ conto: number; codart: string; prezzo: number; dal: Date; al: Date }>(
      `SELECT conto, codart, prezzo, dal, al FROM (
         SELECT lc_conto AS conto, lc_codart AS codart, lc_prezzo AS prezzo, lc_datagg AS dal, lc_datscad AS al,
                ROW_NUMBER() OVER (PARTITION BY lc_conto, lc_codart ORDER BY lc_datagg DESC, lc_progr DESC) AS n
           FROM listini
          WHERE codditt = @ditta AND lc_conto ${CLIENTI} AND lc_coddest = 0 AND lc_codlavo = 0 AND lc_codvalu = 0 AND lc_codtpro = 0 AND lc_fase = 0
            AND RTRIM(ISNULL(lc_codcas, '')) = '' AND @oggi BETWEEN lc_datagg AND lc_datscad AND 1 BETWEEN lc_daquant AND lc_aquant) x
        WHERE n = 1`,
    );
    const scontiCliente = await q<Record<string, unknown> & { conto: number; codart: string; dal: Date; al: Date }>(
      `SELECT conto, codart, dal, al, sc1, sc2, sc3, sc4, sc5, sc6 FROM (
         SELECT so_conto AS conto, so_codart AS codart, so_datagg AS dal, so_datscad AS al,
                so_scont1 AS sc1, so_scont2 AS sc2, so_scont3 AS sc3, so_scont4 AS sc4, so_scont5 AS sc5, so_scont6 AS sc6,
                ROW_NUMBER() OVER (PARTITION BY so_conto, so_codart ORDER BY so_datagg DESC) AS n
           FROM sconti
          WHERE codditt = @ditta AND so_conto ${CLIENTI} AND RTRIM(ISNULL(so_codart, '')) <> '' AND so_clscan = 0 AND so_clscar = 0
            AND RTRIM(ISNULL(so_codcfam, '')) = '' AND so_coddest = 0 AND so_codtpro = 0
            AND @oggi BETWEEN so_datagg AND so_datscad AND so_daquant <= 1 AND so_aquant >= 1) x
        WHERE n = 1`,
    );
    const storico = await q<Record<string, unknown> & { conto: number; codart: string; data: Date; doc: string; prezzo: number }>(
      `WITH righe AS (
         SELECT t.td_conto AS conto, m.mo_codart AS codart, t.td_datord AS data, 3 AS prio,
                'Ordine ' + CAST(t.td_numord AS varchar(12)) AS doc, m.mo_prezzo AS prezzo, ${scontiSql("mo", colOrd)}
           FROM testord t
           JOIN movord m ON m.codditt = t.codditt AND m.mo_tipork = t.td_tipork AND m.mo_anno = t.td_anno AND m.mo_serie = t.td_serie AND m.mo_numord = t.td_numord
           JOIN artico a ON a.codditt = m.codditt AND a.ar_codart = m.mo_codart
          WHERE t.codditt = @ditta AND t.td_tipork = 'R' AND t.td_datord >= @dal AND t.td_conto ${CLIENTI}
            AND m.mo_prezzo > 0 AND m.mo_quant > 0 ${nonOmaggioSql("mo", colOrd)} ${umSql("mo", colOrd)}
         UNION ALL
         SELECT tm.tm_conto, m.mm_codart, tm.tm_datdoc, CASE tm.tm_tipork WHEN 'A' THEN 1 ELSE 2 END,
                CASE tm.tm_tipork WHEN 'A' THEN 'Fattura ' ELSE 'DDT ' END + CAST(tm.tm_numdoc AS varchar(12)), m.mm_prezzo, ${scontiSql("mm", colMag)}
           FROM testmag tm
           JOIN movmag m ON m.codditt = tm.codditt AND m.mm_tipork = tm.tm_tipork AND m.mm_anno = tm.tm_anno AND m.mm_serie = tm.tm_serie AND m.mm_numdoc = tm.tm_numdoc
           JOIN artico a ON a.codditt = m.codditt AND a.ar_codart = m.mm_codart
          WHERE tm.codditt = @ditta AND tm.tm_tipork IN ('A', 'B') AND tm.tm_datdoc >= @dal AND tm.tm_conto ${CLIENTI}
            AND m.mm_prezzo > 0 AND m.mm_quant > 0 ${nonOmaggioSql("mm", colMag)} ${umSql("mm", colMag)}
       )
       SELECT conto, codart, data, doc, prezzo, sc1, sc2, sc3, sc4, sc5, sc6 FROM (
         SELECT *, ROW_NUMBER() OVER (PARTITION BY conto, codart ORDER BY data DESC, prio) AS n FROM righe) x
        WHERE n = 1`,
    );

    sezione("1. Letture da NTS");
    scrivi(
      `  clienti in anagrafica (conti 14xxxxxxx): ${anagra.length} · clienti reali nello shop: ${clientiShop.size} · articoli nello shop: ${articoliShop.size}`,
      `  listini validi oggi: ${listini.length} · sconti di listino: ${scontiListino.length} · prezzi personali: ${personali.length} · sconti cliente × articolo: ${scontiCliente.length}`,
      `  storico (ultima riga per cliente e articolo, dal ${testo(dal).slice(0, 10)}): ${storico.length}`,
      `  righe omaggio escluse dallo storico: sconto 100 % e tipo omaggio "O" (ordini ${colOrd.has("mo_stasino") ? "sì" : "colonna assente"}, documenti ${colMag.has("mm_stasino") ? "sì" : "colonna assente"})`,
      `  colonne facoltative: sconti 3-6 ordini ${[3, 4, 5, 6].filter((i) => colOrd.has(`mo_scont${i}`)).length}/4, documenti ${[3, 4, 5, 6].filter((i) => colMag.has(`mm_scont${i}`)).length}/4 · UM ordini ${colOrd.has("mo_unmis") ? "sì" : "no"}, documenti ${colMag.has("mm_unmis") ? "sì" : "no"}`,
    );

    // 4. Listini dello shop -------------------------------------------------------------------
    const prezzoListino = new Map<string, number>(); // `${chiave}|${listino}` → prezzo al centesimo
    const listiniPayload: Record<string, unknown>[] = [];
    const scontoLis = new Map(scontiListino.map((s) => [`${chiave(s.codart)}|${s.listino}`, s]));
    const perListino = new Map<number, { articoli: number; arrotondati: number }>();
    const scartiListino: string[] = [];
    for (const l of listini) {
      const cod = articoliShop.get(chiave(l.codart));
      if (!cod) continue;
      const prezzo = centesimi(Number(l.prezzo));
      prezzoListino.set(`${chiave(l.codart)}|${l.listino}`, prezzo);
      const stat = perListino.get(l.listino) ?? { articoli: 0, arrotondati: 0 };
      stat.articoli++;
      if (Math.abs(prezzo - Number(l.prezzo)) > 1e-9) stat.arrotondati++;
      perListino.set(l.listino, stat);
      const s = scontoLis.get(`${chiave(l.codart)}|${l.listino}`);
      let sc = { sconto1: 0, sconto2: 0 };
      if (s) {
        const c = combinaSconti(sconti6(s));
        if (c) sc = c;
        else scartiListino.push(`${cod} listino ${l.listino}: sconti di listino ${sconti6(s).join(" + ")} non riducibili a 2 decimali (ignorati)`);
      }
      listiniPayload.push({ cod_dav: cod, listino: l.listino, prezzo, ...sc, valido_dal: iso(data(l.datagg)), aggiornato_il: adesso.toISOString() });
    }
    sezione("2. Listini (articoli dello shop)");
    scrivi(
      ...tabellaTesto([...perListino.entries()].sort((a, b) => a[0] - b[0]).map(([listino, s]) => ({ listino, articoli: s.articoli, arrotondati_al_centesimo: s.arrotondati }))),
      `  con sconti di listino: ${listiniPayload.filter((r) => r.sconto1 || r.sconto2).length}`,
      ...scartiListino.slice(0, 20).map((x) => `  SCARTO ${x}`),
    );

    // 5. Condizioni per cliente ----------------------------------------------------------------
    const perConto = <T extends { conto: number; codart: string }>(righe: T[]) => {
      const m = new Map<number, Map<string, T>>();
      for (const r of righe) {
        const k = chiave(r.codart);
        if (!articoliShop.has(k)) continue;
        const mm = m.get(r.conto) ?? new Map<string, T>();
        mm.set(k, r);
        m.set(r.conto, mm);
      }
      return m;
    };
    const stoPer = perConto(storico);
    const perPer = perConto(personali);
    const scoPer = perConto(scontiCliente);
    const anaPer = new Map(anagra.map((a) => [a.an_conto, a]));

    const condizioni: Record<string, unknown>[] = [];
    const conteggi = new Map<string, number>();
    const scarti: { conto: number; cod: string; motivo: string }[] = [];
    const listiniClienti = new Map<number, number[]>(); // an_listino → conti
    const dettaglio: Record<string, unknown>[] = [];
    let senzaAnagrafica = 0;

    for (const [conto, clienteId] of clientiShop) {
      const an = anaPer.get(conto);
      if (!an) {
        senzaAnagrafica++;
        continue;
      }
      const anL = Number(an.an_listino ?? 0);
      listiniClienti.set(anL, [...(listiniClienti.get(anL) ?? []), conto]);
      const nLis = listinoCliente(anL);
      const codici = new Set<string>([...(stoPer.get(conto)?.keys() ?? []), ...(perPer.get(conto)?.keys() ?? []), ...(scoPer.get(conto)?.keys() ?? [])]);
      for (const k of codici) {
        const s = stoPer.get(conto)?.get(k);
        const p = perPer.get(conto)?.get(k);
        const c = scoPer.get(conto)?.get(k);
        const rigaSto: RigaStorico | null = s ? { data: s.data, doc: String(s.doc), prezzo: Number(s.prezzo), sconti: sconti6(s) } : null;
        const per: PrezzoPersonale | null = p ? { prezzo: Number(p.prezzo), dal: data(p.dal), al: data(p.al) } : null;
        const sco: ScontoCliente | null = c ? { sconti: sconti6(c), dal: data(c.dal), al: data(c.al) } : null;
        const listino = prezzoListino.get(`${k}|${nLis}`) ?? null;
        const r = risolvi(listino, rigaSto, per, sco);
        const cod = articoliShop.get(k)!;
        for (const x of r.scarti) scarti.push({ conto, cod, motivo: x.motivo });
        const cond: Condizione | null = r.condizione;
        if (cond) {
          conteggi.set(cond.origine, (conteggi.get(cond.origine) ?? 0) + 1);
          condizioni.push({
            cliente_id: clienteId, tipo: "articolo", cod_dav: cod, prezzo_accordato: cond.prezzo_accordato, sconto1: cond.sconto1, sconto2: cond.sconto2,
            valido_dal: cond.valido_dal, valido_al: cond.valido_al, origine: cond.origine, rif_storico: cond.rif,
          });
        }
        if (clienteDettaglio && String(conto) === clienteDettaglio && (!articoloDettaglio || k === articoloDettaglio)) {
          const netto = cond?.prezzo_accordato ?? (listino === null ? null : centesimi(listino * (1 - (cond?.sconto1 ?? 0) / 100) * (1 - (cond?.sconto2 ?? 0) / 100)));
          dettaglio.push({
            articolo: cod, listino: listino ?? "-", storico: rigaSto ? `${rigaSto.doc} ${testo(rigaSto.data).slice(0, 10)} ${rigaSto.prezzo} sc ${rigaSto.sconti.filter((x) => x).join("+") || "0"}` : "-",
            personale: per?.prezzo ?? "-", sconto_nts: sco ? sco.sconti.filter((x) => x).join("+") || "0" : "-",
            scelta: cond?.origine ?? "listino", sconti: cond ? `${cond.sconto1}+${cond.sconto2}` : "-", prezzo_finale: netto ?? "-",
          });
        }
      }
      const gen = [Number(an.an_scont1 ?? 0), Number(an.an_scont2 ?? 0)];
      if (gen.some((x) => x !== 0)) {
        const c = combinaSconti(gen);
        if (c) {
          conteggi.set("nts_generale", (conteggi.get("nts_generale") ?? 0) + 1);
          condizioni.push({ cliente_id: clienteId, tipo: "generale", cod_dav: null, prezzo_accordato: null, ...c, valido_dal: null, valido_al: null, origine: "nts_generale", rif_storico: null });
        } else scarti.push({ conto, cod: "(tutti)", motivo: `sconti in anagrafica ${gen.join(" + ")} non riducibili a 2 decimali` });
      }
    }

    sezione("3. Clienti e condizioni");
    scrivi(
      `  clienti reali dello shop senza anagrafica NTS: ${senzaAnagrafica}`,
      "  listino in anagrafica (0 = si usa il 2):",
      ...tabellaTesto([...listiniClienti.entries()].sort((a, b) => a[0] - b[0]).map(([listino, conti]) => ({ an_listino: listino, clienti: conti.length }))),
      "",
      "  condizioni per origine:",
      ...tabellaTesto(["storico_ps", "storico_sconto", "nts_prezzo", "nts_sconto", "nts_generale"].map((o) => ({ origine: o, condizioni: conteggi.get(o) ?? 0 }))),
      `  totale: ${condizioni.length} · scartate: ${scarti.length}`,
      ...scarti.slice(0, 40).map((s) => `  SCARTO cliente ${s.conto} articolo ${s.cod}: ${s.motivo}`),
      ...(scarti.length > 40 ? [`  … altri ${scarti.length - 40} scarti`] : []),
    );
    // Sconti oltre la soglia: nell'ordine diventano l'avviso "CONTROLLARE SCONTISTICA" (non per i prezzi speciali).
    const contoDi = new Map([...clientiShop].map(([conto, id]) => [id, conto]));
    const alti = condizioni
      .filter((c) => c.prezzo_accordato === null && scontoComplessivo(Number(c.sconto1), Number(c.sconto2)) > SOGLIA_SCONTO)
      .map((c) => ({
        cliente: contoDi.get(c.cliente_id as number) ?? "?",
        articolo: c.cod_dav ?? "(tutti)",
        origine: c.origine,
        sconto: `${c.sconto1}+${c.sconto2}`,
        complessivo: scontoComplessivo(Number(c.sconto1), Number(c.sconto2)),
        da: c.rif_storico ?? "",
      }))
      .sort((a, b) => b.complessivo - a.complessivo);
    scrivi(
      "",
      `  sconti oltre il ${SOGLIA_SCONTO}% (negli ordini compare "CONTROLLARE SCONTISTICA"): ${alti.length}`,
      ...tabellaTesto(alti, 80),
    );
    if (clienteDettaglio) {
      sezione(`4. Dettaglio cliente ${clienteDettaglio}${articoloDettaglio ? ` articolo ${articoloDettaglio}` : ""}`);
      scrivi(...tabellaTesto(dettaglio, 200));
    }

    // 6. Scrittura in Supabase (solo con --scrivi) ---------------------------------------------
    sezione("5. Supabase");
    if (!scrivere) {
      scrivi("  PROVA: niente scritto. Per scrivere: npm run importa-prezzi -- --scrivi");
    } else {
      const { error: e0 } = await db.from("listini_nts").select("cod_dav").limit(1);
      if (e0) throw new Error(`listini_nts non leggibile (migrazione 0010 applicata?): ${e0.message}`);
      for (let i = 0; i < listiniPayload.length; i += 500) {
        const { error } = await db.from("listini_nts").upsert(listiniPayload.slice(i, i + 500), { onConflict: "cod_dav,listino" });
        if (error) throw new Error(`listini_nts: ${error.message}`);
      }
      const { error: eVecchi } = await db.from("listini_nts").delete().lt("aggiornato_il", adesso.toISOString());
      if (eVecchi) throw new Error(`listini_nts (pulizia): ${eVecchi.message}`);
      for (const [listino, conti] of listiniClienti) {
        for (let i = 0; i < conti.length; i += 200) {
          const { error } = await db.from("clienti").update({ listino_nts: listino }).in("codice_nts", conti.slice(i, i + 200).map(String));
          if (error) throw new Error(`clienti.listino_nts: ${error.message}`);
        }
      }
      const { error: eDel } = await db.from("condizioni_cliente").delete().in("origine", ORIGINI_IMPORT);
      if (eDel) throw new Error(`condizioni (pulizia): ${eDel.message}`);
      for (let i = 0; i < condizioni.length; i += 500) {
        const { error } = await db.from("condizioni_cliente").insert(condizioni.slice(i, i + 500));
        if (error) throw new Error(`condizioni (lotto ${i}): ${error.message}`);
      }
      await db.from("import_log").insert({
        tipo: "prezzi_nts",
        nome_file: `import-prezzi-${timbro}.txt`,
        righe_lette: listini.length + storico.length + personali.length + scontiCliente.length,
        nuovi: condizioni.length,
        aggiornati: listiniPayload.length,
        errori: scarti.length + scartiListino.length,
        dettaglio_errori: [{ nota: [...conteggi.entries()].map(([o, n]) => `${o} ${n}`).join(", ") }],
        eseguito_da: "connettore",
      });
      scrivi(`  scritti: ${listiniPayload.length} prezzi di listino, listino di ${[...listiniClienti.values()].flat().length} clienti, ${condizioni.length} condizioni`);
    }
  } finally {
    await pool.close();
    mkdirSync(cartella, { recursive: true });
    writeFileSync(file, "﻿" + out.join("\r\n") + "\r\n", "utf8");
  }
  console.log(out.join("\n"));
  console.log(`\nRapporto in ${file}`);
}

main().catch((e) => {
  console.error(messaggio(e));
  process.exit(1);
});
