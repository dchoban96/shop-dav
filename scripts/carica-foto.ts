/**
 * Carica foto, schede tecniche e loghi dei fornitori su Supabase Storage e li collega
 * agli articoli e ai fornitori (STRUTTURA, sezione 6, punto 3).
 *
 *   npm run foto -- --file ../FotoFornitori/Shop/dati/foto_abbinate.json [--dry-run] [--solo-collega]
 *
 * Il file JSON è prodotto da report_foto.xlsx (solo gli abbinamenti con esito OK):
 *   [{ cod_dav, fornitore, cartella, foto, scheda|null }]
 * Le foto vengono ridimensionate a 900 px sul lato lungo e salvate in WebP; le schede
 * PDF restano come sono. Idempotente: si può rilanciare, sovrascrive gli stessi percorsi.
 * Bucket pubblico `catalogo`: foto/<COD_DAV>.webp, schede/<COD_DAV>.pdf, loghi/<CARTELLA>.<ext>.
 */
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import sharp from "sharp";
import { supabaseAdmin } from "../src/lib/supabase/admin";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

type Voce = { cod_dav: string; fornitore: string; cartella: string; foto: string; scheda: string | null };

const BUCKET = "catalogo";
const LATO_MAX = 900;
const PARALLELI = 8;

function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (nome: string) => process.argv.includes(`--${nome}`);

/** Esegue `fn` su tutti gli elementi con al massimo `n` richieste in parallelo. */
async function conParallelismo<T>(elementi: T[], n: number, fn: (e: T, i: number) => Promise<void>): Promise<void> {
  let prossimo = 0;
  const lavoratori = Array.from({ length: Math.min(n, elementi.length) }, async () => {
    while (prossimo < elementi.length) {
      const i = prossimo++;
      await fn(elementi[i], i);
    }
  });
  await Promise.all(lavoratori);
}

async function main() {
  const file = arg("file");
  if (!file) {
    console.error("Uso: npm run foto -- --file <foto_abbinate.json> [--dry-run] [--solo-collega]");
    process.exit(1);
  }
  const voci = JSON.parse(readFileSync(resolve(file), "utf8")) as Voce[];
  const dryRun = flag("dry-run");
  const soloCollega = flag("solo-collega");
  console.log(`Abbinamenti: ${voci.length}, con scheda: ${voci.filter((v) => v.scheda).length}`);
  if (dryRun) {
    const esempio = voci[0];
    console.log("Esempio:", esempio.cod_dav, "→", `foto/${esempio.cod_dav}.webp`, esempio.scheda ? `schede/${esempio.cod_dav}.pdf` : "(senza scheda)");
    return;
  }

  const db = supabaseAdmin();
  const { data: buckets, error: eb } = await db.storage.listBuckets();
  if (eb) throw new Error(`listBuckets: ${eb.message}`);
  if (!buckets?.some((b) => b.name === BUCKET)) {
    const { error } = await db.storage.createBucket(BUCKET, { public: true, fileSizeLimit: 20 * 1024 * 1024 });
    if (error) throw new Error(`createBucket: ${error.message}`);
    console.log(`Bucket "${BUCKET}" creato (pubblico)`);
  }
  const url = (percorso: string) => db.storage.from(BUCKET).getPublicUrl(percorso).data.publicUrl;

  // Solo gli articoli presenti a catalogo (la chiave esterna lo richiede)
  const presenti = new Set<string>();
  for (let da = 0; ; da += 1000) {
    const { data, error } = await db.from("articoli").select("cod_dav").range(da, da + 999);
    if (error) throw new Error(error.message);
    for (const a of data ?? []) presenti.add(a.cod_dav as string);
    if (!data || data.length < 1000) break;
  }
  const lavoro = voci.filter((v) => presenti.has(v.cod_dav));
  if (lavoro.length < voci.length) console.warn(`Saltati ${voci.length - lavoro.length} codici non presenti a catalogo`);

  const errori: string[] = [];
  let foto = 0;
  let schede = 0;
  let byteOriginali = 0;
  let byteCaricati = 0;

  await conParallelismo(lavoro, PARALLELI, async (v, i) => {
    try {
      const percorsoFoto = `foto/${v.cod_dav}.webp`;
      if (!soloCollega) {
        const originale = readFileSync(v.foto);
        const webp = await sharp(originale)
          .rotate()
          .resize({ width: LATO_MAX, height: LATO_MAX, fit: "inside", withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer();
        byteOriginali += originale.length;
        byteCaricati += webp.length;
        const { error } = await db.storage.from(BUCKET).upload(percorsoFoto, webp, { contentType: "image/webp", upsert: true, cacheControl: "31536000" });
        if (error) throw new Error(`foto: ${error.message}`);
        foto++;
      }
      const patch: Record<string, string> = { foto_path: url(percorsoFoto) };
      if (v.scheda) {
        const percorsoScheda = `schede/${v.cod_dav}.pdf`;
        if (!soloCollega) {
          const { error } = await db.storage.from(BUCKET).upload(percorsoScheda, readFileSync(v.scheda), { contentType: "application/pdf", upsert: true, cacheControl: "31536000" });
          if (error) throw new Error(`scheda: ${error.message}`);
          schede++;
        }
        patch.scheda_pdf_path = url(percorsoScheda);
      }
      const { error: eu } = await db.from("articoli").update(patch).eq("cod_dav", v.cod_dav);
      if (eu) throw new Error(`collegamento: ${eu.message}`);
      if ((i + 1) % 100 === 0) console.log(`  ${i + 1}/${lavoro.length}`);
    } catch (e) {
      errori.push(`${v.cod_dav}: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  // Cartelle foto dei fornitori (per il collegamento automatico degli import futuri)
  const cartelle = new Map<string, string>();
  for (const v of voci) cartelle.set(v.fornitore, v.cartella);
  for (const [nome, cartella] of cartelle) {
    const { error } = await db.from("fornitori").update({ cartella_foto: cartella }).eq("nome_nts", nome);
    if (error) errori.push(`fornitore ${nome}: ${error.message}`);
  }

  // Loghi: ../loghi/<CARTELLA>.<ext> accanto alla cartella delle foto
  const cartellaFoto = dirname(dirname(resolve(voci[0].foto)));
  const loghiDir = join(dirname(cartellaFoto), "loghi");
  let loghi = 0;
  if (!soloCollega && existsSync(loghiDir)) {
    const { readdirSync } = await import("node:fs");
    for (const nomeFile of readdirSync(loghiDir)) {
      const ext = extname(nomeFile).toLowerCase();
      const cartella = basename(nomeFile, extname(nomeFile));
      const tipo = ext === ".svg" ? "image/svg+xml" : ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : null;
      if (!tipo) continue;
      const percorso = `loghi/${cartella}${ext}`;
      const { error } = await db.storage.from(BUCKET).upload(percorso, readFileSync(join(loghiDir, nomeFile)), { contentType: tipo, upsert: true });
      if (error) {
        errori.push(`logo ${nomeFile}: ${error.message}`);
        continue;
      }
      const { error: eu } = await db.from("fornitori").update({ logo_path: url(percorso) }).eq("cartella_foto", cartella);
      if (eu) errori.push(`logo ${nomeFile}: ${eu.message}`);
      loghi++;
    }
  }

  const mb = (n: number) => (n / 1e6).toFixed(0);
  console.log(`Foto caricate: ${foto} (${mb(byteOriginali)} MB → ${mb(byteCaricati)} MB), schede: ${schede}, loghi: ${loghi}, cartelle fornitori: ${cartelle.size}, errori: ${errori.length}`);
  for (const e of errori.slice(0, 15)) console.log("  " + e);

  const { error: el } = await db.from("import_log").insert({
    tipo: "foto",
    nome_file: basename(file),
    righe_lette: voci.length,
    nuovi: foto,
    aggiornati: 0,
    errori: errori.length,
    dettaglio_errori: errori.slice(0, 200).map((e, i) => ({ riga: i + 1, errore: e })),
    eseguito_da: "script",
  });
  if (el) console.warn(`import_log: ${el.message}`);
  if (errori.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
