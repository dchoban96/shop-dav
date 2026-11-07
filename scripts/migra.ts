/**
 * Applica le migrazioni di supabase/migrations/ al database indicato da DATABASE_URL
 * (connection string Postgres del progetto Supabase, con la password del database).
 * Tiene traccia di cosa è già stato applicato nella tabella public._migrazioni:
 * rilanciarlo non riapplica nulla. Eseguire con: npm run migra
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const DIR = join(process.cwd(), "supabase", "migrations");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL mancante in .env.local (Project Settings → Database → Connection string).");
    process.exit(1);
  }
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(`
      create table if not exists public._migrazioni (
        nome text primary key,
        applicata_il timestamptz not null default now()
      )`);
    const { rows } = await client.query<{ nome: string }>("select nome from public._migrazioni");
    const fatte = new Set(rows.map((r) => r.nome));
    const file = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
    let applicate = 0;
    for (const f of file) {
      if (fatte.has(f)) {
        console.log(`${f}: già applicata`);
        continue;
      }
      process.stdout.write(`${f}: applico … `);
      await client.query("begin");
      try {
        await client.query(readFileSync(join(DIR, f), "utf8"));
        await client.query("insert into public._migrazioni (nome) values ($1)", [f]);
        await client.query("commit");
        console.log("ok");
        applicate++;
      } catch (e) {
        await client.query("rollback");
        console.log("ERRORE");
        throw e;
      }
    }
    console.log(`Migrazioni applicate ora: ${applicate}, totali: ${file.length}`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
