/**
 * Import dello storico vendite dal data.json del cruscotto agenti (STRUTTURA, sezione 6).
 *
 *   npm run vendite -- --file ../FotoFornitori/Shop/dati/vendite/data.json [--dry-run]
 *
 * Il file è l'aggregato mensile per cliente × articolo costruito da build_data.py sugli
 * export NTS (2022-09 → ultimo mese). Da qui si ricavano:
 *   - clienti           codice NTS, ragione sociale, agente (demo = false)
 *   - storico_acquisti  ultimo acquisto, quantità dell'ultimo mese, 12 mesi e totali
 *   - acquisti_mensili  quantità, valore e righe per mese
 *   - articoli.prezzo_listino   prezzo di listino unitario = valore listino / quantità
 *                               dell'ultimo mese in cui l'articolo è stato venduto
 *   - condizioni_cliente (tipo articolo, prezzo_accordato) = ultimo prezzo netto unitario
 *                               fatturato a quel cliente per quell'articolo
 *
 * Le condizioni così create sono un ripiego finché non arriva l'export NTS delle condizioni
 * commerciali: quell'import le sostituirà. Idempotente: ricaricare lo stesso file non duplica.
 * Usa il service role (bypassa RLS): solo da macchina dell'ufficio o job.
 */
import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { supabaseAdmin } from "../src/lib/supabase/admin";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

type Cubo = { c: number[]; r: number[]; m: number[]; u: number[]; v: number[]; q: number[]; l: number[]; n: number[] };
type Dati = {
  meta: { generato: string; ultimoMese: string; righe: number };
  yms: string[];
  agents: string[];
  clients: [string, string, number, number][];
  articles: [string, string, ...unknown[]][];
  cube: Cubo;
};

const LOTTO = 1000;
const MESI_12 = 12;

function parseArgs(): { file: string; dryRun: boolean } {
  const a = process.argv.slice(2);
  const i = a.indexOf("--file");
  if (i < 0 || !a[i + 1]) {
    console.error("Uso: npm run vendite -- --file <data.json> [--dry-run]");
    process.exit(2);
  }
  return { file: resolve(a[i + 1]), dryRun: a.includes("--dry-run") };
}

/** 'YYYY-MM' → primo e ultimo giorno del mese, in ISO. */
function primoGiorno(ym: string): string {
  return `${ym}-01`;
}
function ultimoGiorno(ym: string): string {
  const [anno, mese] = ym.split("-").map(Number);
  const giorni = new Date(Date.UTC(anno, mese, 0)).getUTCDate();
  return `${ym}-${String(giorni).padStart(2, "0")}`;
}

/** Nomi NTS di posizioni chiuse: non devono poter entrare nello shop. */
function clienteSpento(nome: string): boolean {
  return /NON USARE|dismesso|cessat|\*\*\*/i.test(nome);
}

async function main() {
  const { file, dryRun } = parseArgs();
  const dati = JSON.parse(readFileSync(file, "utf-8")) as Dati;
  const { yms, agents, clients, articles, cube } = dati;
  const nMesi = yms.length;
  const righe = cube.c.length;
  const soglia12 = nMesi - MESI_12; // indice del primo mese degli ultimi 12
  console.log(`File generato il ${dati.meta.generato}, ultimo mese ${dati.meta.ultimoMese}: ${clients.length} clienti, ${articles.length} articoli, ${righe} righe cliente×articolo×mese`);

  const db = supabaseAdmin();

  // Articoli presenti a catalogo (chiave esterna di storico e condizioni) con descrizione, per l'upsert del listino
  const descrizioni = new Map<string, string>();
  for (let da = 0; ; da += LOTTO) {
    const { data, error } = await db.from("articoli").select("cod_dav, descrizione_nts").range(da, da + LOTTO - 1);
    if (error) throw new Error(`lettura articoli: ${error.message}`);
    for (const r of data ?? []) descrizioni.set(r.cod_dav, r.descrizione_nts);
    if (!data || data.length < LOTTO) break;
  }
  const articoliFuori = new Set<number>();
  articles.forEach((a, i) => {
    if (!descrizioni.has(a[0])) articoliFuori.add(i);
  });
  console.log(`Articoli a catalogo: ${descrizioni.size}; nel file ma non a catalogo (ignorati): ${articoliFuori.size}`);

  // 1. Clienti ----------------------------------------------------------------
  const clientiPayload = clients.map(([codice, nome, agente]) => ({
    codice_nts: codice.trim().toUpperCase(),
    ragione_sociale: nome.trim(),
    agente_codice: agents[agente] ?? null,
    demo: false,
    attivo: !clienteSpento(nome),
  }));
  const spenti = clientiPayload.filter((c) => !c.attivo).length;
  console.log(`Clienti: ${clientiPayload.length} (di cui ${spenti} chiusi, attivo = false)`);

  // 2. Aggregazioni dal cubo ----------------------------------------------------
  type Agg = { ultimoM: number; qUlt: number; nUlt: number; vUlt: number; primoM: number; n12: number; q12: number; v12: number; nTot: number; qTot: number; vTot: number };
  const perCoppia = new Map<string, Agg>(); // "c|r"
  const listino = new Map<number, { m: number; prezzo: number }>(); // r → ultimo listino unitario
  // Il cubo ha una riga per cliente × articolo × mese × unità di misura: qui si somma per mese.
  const mensiliPerChiave = new Map<string, { c: number; r: number; m: number; q: number; v: number; n: number }>();

  for (let i = 0; i < righe; i++) {
    const r = cube.r[i];
    if (articoliFuori.has(r)) continue;
    const c = cube.c[i], m = cube.m[i], q = cube.q[i], v = cube.v[i], l = cube.l[i], n = cube.n[i];
    const km = `${c}|${r}|${m}`;
    const mm = mensiliPerChiave.get(km);
    if (mm) { mm.q += q; mm.v += v; mm.n += n; } else mensiliPerChiave.set(km, { c, r, m, q, v, n });
    const k = `${c}|${r}`;
    const a = perCoppia.get(k);
    if (!a) {
      perCoppia.set(k, { ultimoM: m, qUlt: q, nUlt: n, vUlt: v, primoM: m, n12: m >= soglia12 ? n : 0, q12: m >= soglia12 ? q : 0, v12: m >= soglia12 ? v : 0, nTot: n, qTot: q, vTot: v });
    } else {
      if (m > a.ultimoM) { a.ultimoM = m; a.qUlt = q; a.nUlt = n; a.vUlt = v; }
      else if (m === a.ultimoM) { a.qUlt += q; a.nUlt += n; a.vUlt += v; }
      if (m < a.primoM) a.primoM = m;
      if (m >= soglia12) { a.n12 += n; a.q12 += q; a.v12 += v; }
      a.nTot += n; a.qTot += q; a.vTot += v;
    }
    if (q > 0 && l > 0) {
      const att = listino.get(r);
      if (!att || m > att.m) listino.set(r, { m, prezzo: l / q });
    }
  }
  const mensili = [...mensiliPerChiave.values()];
  console.log(`Coppie cliente×articolo: ${perCoppia.size}; righe mensili: ${mensili.length}; articoli con listino ricavabile: ${listino.size}`);

  if (dryRun) {
    console.log("Prova a secco: nessuna scrittura.");
    return;
  }

  // 3. Scrittura clienti e mappa codice → id --------------------------------------
  for (let i = 0; i < clientiPayload.length; i += LOTTO) {
    const { error } = await db.from("clienti").upsert(clientiPayload.slice(i, i + LOTTO), { onConflict: "codice_nts" });
    if (error) throw new Error(`clienti: ${error.message}`);
  }
  const idCliente = new Map<string, number>();
  for (let da = 0; ; da += LOTTO) {
    const { data, error } = await db.from("clienti").select("id, codice_nts").range(da, da + LOTTO - 1);
    if (error) throw new Error(`lettura clienti: ${error.message}`);
    for (const r of data ?? []) idCliente.set(r.codice_nts, r.id);
    if (!data || data.length < LOTTO) break;
  }
  const idPerIndice = clients.map(([codice]) => idCliente.get(codice.trim().toUpperCase()) ?? null);
  console.log(`Clienti scritti: ${clientiPayload.length}`);

  // 4. Listino articoli ---------------------------------------------------------------
  const listinoPayload = [...listino].map(([r, { prezzo }]) => ({
    cod_dav: articles[r][0],
    descrizione_nts: descrizioni.get(articles[r][0])!,
    prezzo_listino: Math.round(prezzo * 10000) / 10000,
  }));
  for (let i = 0; i < listinoPayload.length; i += LOTTO) {
    const { error } = await db.from("articoli").upsert(listinoPayload.slice(i, i + LOTTO), { onConflict: "cod_dav" });
    if (error) throw new Error(`listino: ${error.message}`);
  }
  console.log(`Listino aggiornato su ${listinoPayload.length} articoli`);

  // 5. Storico acquisti ---------------------------------------------------------------
  const storicoPayload: Record<string, unknown>[] = [];
  const condizioniPayload: Record<string, unknown>[] = [];
  for (const [k, a] of perCoppia) {
    const [ci, ri] = k.split("|").map(Number);
    const clienteId = idPerIndice[ci];
    if (!clienteId) continue;
    const codDav = articles[ri][0];
    storicoPayload.push({
      cliente_id: clienteId,
      cod_dav: codDav,
      ultima_data: ultimoGiorno(yms[a.ultimoM]),
      ultima_quantita: a.nUlt > 0 ? Math.max(1, Math.round(a.qUlt / a.nUlt)) : null,
      n_ordini_12m: a.n12,
      qta_12m: a.q12,
      fatturato_12m: Math.round(a.v12 * 100) / 100,
      n_ordini_tot: a.nTot,
      qta_tot: a.qTot,
      fatturato_tot: Math.round(a.vTot * 100) / 100,
      prima_data: primoGiorno(yms[a.primoM]),
    });
    if (a.qUlt > 0 && a.vUlt > 0) {
      condizioniPayload.push({
        cliente_id: clienteId,
        tipo: "articolo",
        cod_dav: codDav,
        prezzo_accordato: Math.round((a.vUlt / a.qUlt) * 10000) / 10000,
        valido_dal: primoGiorno(yms[a.ultimoM]),
      });
    }
  }
  for (let i = 0; i < storicoPayload.length; i += LOTTO) {
    const { error } = await db.from("storico_acquisti").upsert(storicoPayload.slice(i, i + LOTTO), { onConflict: "cliente_id,cod_dav" });
    if (error) throw new Error(`storico_acquisti: ${error.message}`);
  }
  console.log(`Storico acquisti: ${storicoPayload.length} righe`);

  // 6. Condizioni per articolo (ultimo prezzo netto): via le precedenti dello stesso tipo, poi inserimento
  const idClienti = [...new Set(storicoPayload.map((s) => s.cliente_id as number))];
  for (let i = 0; i < idClienti.length; i += 200) {
    const { error } = await db.from("condizioni_cliente").delete().eq("tipo", "articolo").in("cliente_id", idClienti.slice(i, i + 200));
    if (error) throw new Error(`condizioni (pulizia): ${error.message}`);
  }
  for (let i = 0; i < condizioniPayload.length; i += LOTTO) {
    const { error } = await db.from("condizioni_cliente").insert(condizioniPayload.slice(i, i + LOTTO));
    if (error) throw new Error(`condizioni: ${error.message}`);
  }
  console.log(`Condizioni per articolo (ultimo prezzo netto): ${condizioniPayload.length}`);

  // 7. Acquisti mensili ---------------------------------------------------------------
  const mensiliPayload = mensili.flatMap((x) => {
    const clienteId = idPerIndice[x.c];
    if (!clienteId) return [];
    const [anno, mese] = yms[x.m].split("-").map(Number);
    return [{ cliente_id: clienteId, cod_dav: articles[x.r][0], anno, mese, qta: x.q, valore: Math.round(x.v * 100) / 100, n_righe: x.n }];
  });
  for (let i = 0; i < mensiliPayload.length; i += LOTTO) {
    const { error } = await db.from("acquisti_mensili").upsert(mensiliPayload.slice(i, i + LOTTO), { onConflict: "cliente_id,cod_dav,anno,mese" });
    if (error) throw new Error(`acquisti_mensili (lotto ${i}): ${error.message}`);
    if ((i / LOTTO) % 50 === 0) console.log(`  acquisti mensili: ${i}/${mensiliPayload.length}`);
  }
  console.log(`Acquisti mensili: ${mensiliPayload.length} righe`);

  const { error: eLog } = await db.from("import_log").insert({
    tipo: "vendite",
    nome_file: basename(file),
    righe_lette: righe,
    nuovi: storicoPayload.length,
    aggiornati: mensiliPayload.length,
    errori: 0,
    dettaglio_errori: [{ nota: `clienti ${clientiPayload.length}, listino ${listinoPayload.length}, condizioni ${condizioniPayload.length}, ultimo mese ${dati.meta.ultimoMese}` }],
    eseguito_da: "script",
  });
  if (eLog) console.warn(`import_log: ${eLog.message}`);
  console.log("Fatto.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
