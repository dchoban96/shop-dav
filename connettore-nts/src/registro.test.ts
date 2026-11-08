import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { FileRegistro } from "./registro.js";

function cartella() {
  return mkdtempSync(join(tmpdir(), "registro-"));
}

test("rotazione giornaliera: il file del giorno prima diventa connettore-AAAA-MM-GG.log", () => {
  const dir = cartella();
  try {
    let ora = new Date(2026, 10, 9, 23, 59, 0);
    const r = new FileRegistro(dir, 30, () => ora);
    r.scrivi("riga del 9");
    ora = new Date(2026, 10, 10, 0, 0, 30);
    r.scrivi("riga del 10");
    assert.deepEqual(readdirSync(dir).sort(), ["connettore-2026-11-09.log", "connettore.log"]);
    assert.equal(readFileSync(join(dir, "connettore-2026-11-09.log"), "utf8"), "riga del 9\r\n");
    assert.equal(readFileSync(join(dir, "connettore.log"), "utf8"), "riga del 10\r\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("conservazione 30 giorni: gli archivi più vecchi vengono cancellati", () => {
  const dir = cartella();
  try {
    for (const g of ["2026-10-09", "2026-10-10", "2026-10-11", "2026-11-08"]) writeFileSync(join(dir, `connettore-${g}.log`), "x");
    writeFileSync(join(dir, "altro.txt"), "non toccare");
    new FileRegistro(dir, 30, () => new Date(2026, 10, 10, 8, 0, 0));
    assert.deepEqual(readdirSync(dir).sort(), ["altro.txt", "connettore-2026-10-11.log", "connettore-2026-11-08.log"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("avvio dopo un giorno di fermo: connettore.log vecchio archiviato con la sua data", () => {
  const dir = cartella();
  try {
    const vecchio = join(dir, "connettore.log");
    writeFileSync(vecchio, "di ieri\r\n");
    const ieri = new Date(2026, 10, 8, 18, 0, 0);
    utimesSync(vecchio, ieri, ieri);
    const r = new FileRegistro(dir, 30, () => new Date(2026, 10, 10, 7, 0, 0));
    assert.ok(existsSync(join(dir, "connettore-2026-11-08.log")));
    assert.ok(!existsSync(vecchio));
    r.scrivi("oggi");
    assert.equal(readFileSync(vecchio, "utf8"), "oggi\r\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("stesso giorno: nessuna rotazione al riavvio", () => {
  const dir = cartella();
  try {
    const ora = () => new Date();
    new FileRegistro(dir, 30, ora).scrivi("prima");
    new FileRegistro(dir, 30, ora).scrivi("dopo il riavvio");
    assert.deepEqual(readdirSync(dir), ["connettore.log"]);
    assert.equal(readFileSync(join(dir, "connettore.log"), "utf8"), "prima\r\ndopo il riavvio\r\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
