/**
 * Import da riga di comando (STRUTTURA, sezione 6).
 *
 *   npm run import -- --tipo catalogo --file ../FotoFornitori/Shop/articoli_catalogo.csv
 *
 * Tipi disponibili: catalogo. In arrivo: articoli, giacenze, clienti, condizioni,
 * vendite, fatture, agente-cliente (appena ci sono gli export NTS).
 * Usa il service role (bypassa RLS): solo da macchina dell'ufficio o job.
 */
import { readFileSync, existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import { supabaseAdmin } from "../src/lib/supabase/admin";
import {
  CARTELLE_FOTO,
  calcolaSigle,
  descrizionePulita,
  leggiCatalogo,
  nomeBreve,
  type ErroreRiga,
} from "../src/lib/import/catalogo";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

type Args = { tipo?: string; file?: string; "dry-run"?: boolean };

function parseArgs(): Args {
  const out: Args = {};
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--tipo") out.tipo = a[++i];
    else if (a[i] === "--file") out.file = a[++i];
    else if (a[i] === "--dry-run") out["dry-run"] = true;
  }
  return out;
}

async function importaCatalogo(file: string, dryRun: boolean) {
  const testo = readFileSync(file, "utf8");
  const { righe, errori } = leggiCatalogo(testo);
  const sigle = calcolaSigle(righe);
  console.log(`Righe valide: ${righe.length}, errori di riga: ${errori.length}`);
  console.log(`Fornitori con sigle: ${sigle.size}`);
  if (dryRun) {
    for (const [f, s] of [...sigle.entries()].slice(0, 15)) console.log(`  ${f}: ${s.join(", ")}`);
    for (const r of righe.slice(0, 5)) {
      console.log(`  ${r.cod_dav} | ${r.descrizione} → ${descrizionePulita(r.descrizione, sigle.get(r.fornitore) ?? [])}`);
    }
    return;
  }

  const db = supabaseAdmin();
  const nomiFornitori = [...new Set(righe.map((r) => r.fornitore))];
  const nomiFamiglie = [...new Set(righe.map((r) => r.famiglia))];

  // Fornitori: upsert per nome_nts, con sigle e cartella foto
  {
    const payload = nomiFornitori.map((nome) => ({
      nome_nts: nome,
      nome_breve: nomeBreve(nome),
      sigle: sigle.get(nome) ?? [],
      cartella_foto: CARTELLE_FOTO[nome] ?? null,
    }));
    const { error } = await db.from("fornitori").upsert(payload, { onConflict: "nome_nts" });
    if (error) throw new Error(`fornitori: ${error.message}`);
  }
  {
    const { error } = await db
      .from("famiglie")
      .upsert(nomiFamiglie.map((nome) => ({ nome })), { onConflict: "nome", ignoreDuplicates: true });
    if (error) throw new Error(`famiglie: ${error.message}`);
  }

  const { data: fornitori, error: ef } = await db.from("fornitori").select("id, nome_nts");
  if (ef) throw new Error(ef.message);
  const { data: famiglie, error: efa } = await db.from("famiglie").select("id, nome");
  if (efa) throw new Error(efa.message);
  const idFornitore = new Map(fornitori!.map((f) => [f.nome_nts as string, f.id as number]));
  const idFamiglia = new Map(famiglie!.map((f) => [f.nome as string, f.id as number]));

  // L'API restituisce al massimo 1000 righe per chiamata: si legge a pagine.
  const giaPresenti = new Set<string>();
  for (let da = 0; ; da += 1000) {
    const { data, error } = await db.from("articoli").select("cod_dav").range(da, da + 999);
    if (error) throw new Error(error.message);
    for (const a of data ?? []) giaPresenti.add(a.cod_dav as string);
    if (!data || data.length < 1000) break;
  }

  let nuovi = 0;
  let aggiornati = 0;
  const erroriDb: ErroreRiga[] = [];
  const lotto = 500;
  for (let i = 0; i < righe.length; i += lotto) {
    const blocco = righe.slice(i, i + lotto).map((r) => ({
      cod_dav: r.cod_dav,
      descrizione_nts: r.descrizione,
      descrizione_pulita: descrizionePulita(r.descrizione, sigle.get(r.fornitore) ?? []),
      fornitore_id: idFornitore.get(r.fornitore) ?? null,
      famiglia_id: idFamiglia.get(r.famiglia) ?? null,
      fatturato_12m: r.fatturato_12m,
      top80: r.top80,
      attivo: true,
    }));
    const { error } = await db.from("articoli").upsert(blocco, { onConflict: "cod_dav" });
    if (error) {
      erroriDb.push({ riga: i + 2, errore: `lotto ${i}-${i + blocco.length}: ${error.message}` });
      continue;
    }
    for (const b of blocco) {
      if (giaPresenti.has(b.cod_dav)) aggiornati++;
      else nuovi++;
    }
  }

  // Articoli spariti dal file → attivo = false
  const nelFile = new Set(righe.map((r) => r.cod_dav));
  const spariti = [...giaPresenti].filter((c) => !nelFile.has(c));
  if (spariti.length) {
    const { error } = await db.from("articoli").update({ attivo: false }).in("cod_dav", spariti);
    if (error) erroriDb.push({ riga: 0, errore: `disattivazione: ${error.message}` });
  }

  const tuttiErrori = [...errori, ...erroriDb];
  const { error: el } = await db.from("import_log").insert({
    tipo: "catalogo",
    nome_file: basename(file),
    righe_lette: righe.length + errori.length,
    nuovi,
    aggiornati,
    errori: tuttiErrori.length,
    dettaglio_errori: tuttiErrori.slice(0, 200),
    eseguito_da: "script",
  });
  if (el) console.warn(`import_log: ${el.message}`);

  console.log(`Nuovi: ${nuovi}, aggiornati: ${aggiornati}, disattivati: ${spariti.length}, errori: ${tuttiErrori.length}`);
  for (const e of tuttiErrori.slice(0, 10)) console.log(`  riga ${e.riga}: ${e.errore}`);
}

async function main() {
  const args = parseArgs();
  if (!args.tipo || !args.file) {
    console.error("Uso: npm run import -- --tipo <catalogo> --file <percorso> [--dry-run]");
    process.exit(1);
  }
  const file = resolve(args.file);
  if (!existsSync(file)) {
    console.error(`File non trovato: ${file}`);
    process.exit(1);
  }
  switch (args.tipo) {
    case "catalogo":
      await importaCatalogo(file, Boolean(args["dry-run"]));
      break;
    default:
      console.error(`Tipo non ancora supportato: ${args.tipo}`);
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
