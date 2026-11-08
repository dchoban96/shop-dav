import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { LOG_RUOTATO, pulisciLog } from "./pulizia-log.js";

test("pulizia log: cancella solo i ruotati più vecchi di 30 giorni, mai il file in uso", () => {
  const dir = mkdtempSync(join(tmpdir(), "log-"));
  try {
    const adesso = new Date("2026-12-31T12:00:00").getTime();
    const giorno = 24 * 60 * 60 * 1000;
    const crea = (nome: string, eta: number) => {
      const p = join(dir, nome);
      writeFileSync(p, "x");
      const t = new Date(adesso - eta * giorno);
      utimesSync(p, t, t);
    };
    crea("connettore.log", 90); // in uso: mai toccato anche se vecchio
    crea("connettore-20261001T000000.123.log", 91);
    crea("connettore-20261120T000000.456.log", 41);
    crea("connettore-20261215T000000.789.log", 16);
    crea("appunti.log", 90); // non è un registro ruotato

    const cancellati = pulisciLog(dir, 30, adesso).sort();
    assert.deepEqual(cancellati, ["connettore-20261001T000000.123.log", "connettore-20261120T000000.456.log"]);
    assert.deepEqual(readdirSync(dir).sort(), ["appunti.log", "connettore-20261215T000000.789.log", "connettore.log"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("pulizia log: cartella assente non è un errore", () => {
  assert.deepEqual(pulisciLog(join(tmpdir(), "non-esiste-" + Date.now())), []);
});

test("nomi dei file ruotati da NSSM", () => {
  assert.ok(LOG_RUOTATO.test("connettore-20261108T201500.500.log"));
  assert.ok(LOG_RUOTATO.test("connettore-20261108T201500.log"));
  assert.ok(!LOG_RUOTATO.test("connettore.log"));
  assert.ok(!LOG_RUOTATO.test("altro-20261108T201500.500.log"));
});
