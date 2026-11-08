/**
 * Import del listino articoli NTS dalla pagina "Listino Pizzerie" (Listino_Pizzerie.html)
 * o dal suo JSON estratto.
 *
 *   npm run listino -- --file ../FotoFornitori/Shop/dati/listino/Listino_Pizzerie.html [--dry-run]
 *
 * La pagina incorpora il catalogo NTS completo: per ogni articolo codice, descrizione,
 * unità di misura ufficiale (KG, PZ, CT, CF, LT, BU, FI) e prezzo di listino lordo.
 * Da qui si aggiornano `articoli.um` e `articoli.prezzo_listino`; vince su quanto ricavato
 * dal cubo vendite (importa-vendite.ts), che resta il ripiego per gli articoli assenti qui.
 * Non crea articoli: aggiorna solo quelli già a catalogo. Idempotente.
 * Usa il service role (bypassa RLS): solo da macchina dell'ufficio o job.
 */
import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { supabaseAdmin } from "../src/lib/supabase/admin";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

/** [codice, descrizione, um, lordo, famiglia, prezzo medio pizzerie] */
type VoceListino = [string, string, string, number | null, string | null, number | null];
type Dati = { generato: string; periodo?: string; catalogo: VoceListino[] };

const LOTTO = 1000;

function parseArgs(): { file: string; dryRun: boolean } {
  const a = process.argv.slice(2);
  const i = a.indexOf("--file");
  if (i < 0 || !a[i + 1]) {
    console.error("Uso: npm run listino -- --file <Listino_Pizzerie.html | catalogo.json> [--dry-run]");
    process.exit(2);
  }
  return { file: resolve(a[i + 1]), dryRun: a.includes("--dry-run") };
}

/** Dalla pagina HTML prende il blocco <script id="data">…</script>; un .json viene letto com'è. */
function leggiDati(file: string): Dati {
  const testo = readFileSync(file, "utf-8");
  if (file.toLowerCase().endsWith(".json")) return JSON.parse(testo) as Dati;
  const m = testo.match(/<script[^>]*id="data"[^>]*>([\s\S]*?)<\/script>/) ?? testo.match(/<script[^>]*>(\{"generato"[\s\S]*?)<\/script>/);
  if (!m) throw new Error("Nella pagina non trovo il blocco dati (<script id=\"data\">).");
  return JSON.parse(m[1]) as Dati;
}

async function main() {
  const { file, dryRun } = parseArgs();
  const dati = leggiDati(file);
  const voci = dati.catalogo.filter((v) => v[0] && v[2]);
  console.log(`Listino generato il ${dati.generato}${dati.periodo ? ` (${dati.periodo})` : ""}: ${voci.length} articoli`);

  const perUm = new Map<string, number>();
  for (const v of voci) perUm.set(v[2], (perUm.get(v[2]) ?? 0) + 1);
  console.log("Unità di misura:", [...perUm].map(([u, n]) => `${u} ${n}`).join(", "));

  const db = supabaseAdmin();
  const descrizioni = new Map<string, string>();
  for (let da = 0; ; da += LOTTO) {
    const { data, error } = await db.from("articoli").select("cod_dav, descrizione_nts").range(da, da + LOTTO - 1);
    if (error) throw new Error(`lettura articoli: ${error.message}`);
    for (const r of data ?? []) descrizioni.set(r.cod_dav, r.descrizione_nts);
    if (!data || data.length < LOTTO) break;
  }

  const payload = voci
    .filter((v) => descrizioni.has(v[0].trim()))
    .map((v) => ({
      cod_dav: v[0].trim(),
      descrizione_nts: descrizioni.get(v[0].trim())!,
      um: v[2].trim().toUpperCase(),
      ...(v[3] && v[3] > 0 ? { prezzo_listino: Math.round(v[3] * 10000) / 10000 } : {}),
    }));
  const nonACatalogo = voci.length - payload.length;
  console.log(`Articoli a catalogo da aggiornare: ${payload.length}; nel listino ma non a catalogo (ignorati): ${nonACatalogo}`);

  if (dryRun) {
    console.log("Prova a secco: nessuna scrittura.");
    return;
  }

  for (let i = 0; i < payload.length; i += LOTTO) {
    const { error } = await db.from("articoli").upsert(payload.slice(i, i + LOTTO), { onConflict: "cod_dav" });
    if (error) throw new Error(`articoli: ${error.message}`);
  }
  console.log(`Aggiornati um e prezzo_listino su ${payload.length} articoli`);

  const { error: eLog } = await db.from("import_log").insert({
    tipo: "listino",
    nome_file: basename(file),
    righe_lette: voci.length,
    nuovi: 0,
    aggiornati: payload.length,
    errori: 0,
    dettaglio_errori: [{ nota: `listino del ${dati.generato}; non a catalogo ${nonACatalogo}` }],
    eseguito_da: "script",
  });
  if (eLog) console.warn(`import_log: ${eLog.message}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
