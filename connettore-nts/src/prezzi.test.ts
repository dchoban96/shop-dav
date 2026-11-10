import assert from "node:assert/strict";
import { test } from "node:test";
import { centesimi, combinaSconti, listinoCliente, risolvi, type RigaStorico } from "./prezzi.js";

const storico = (prezzo: number, sconti: number[] = [0, 0]): RigaStorico => ({ data: new Date(2026, 10, 6), doc: "Ordine 23852", prezzo, sconti });

test("centesimo più vicino", () => {
  assert.equal(centesimi(2.006), 2.01);
  assert.equal(centesimi(38.488), 38.49);
  assert.equal(centesimi(2.365), 2.37);
  assert.equal(centesimi(1.555), 1.56);
  assert.equal(centesimi(6.9), 6.9);
});

test("sconti NTS ridotti ai due della frontiera", () => {
  assert.deepEqual(combinaSconti([15, 0, 0]), { sconto1: 15, sconto2: 0 });
  assert.deepEqual(combinaSconti([10, 5, 5]), { sconto1: 10, sconto2: 9.75 });
  assert.equal(combinaSconti([10, 3, 3, 3]), null, "8,7327 % non sta in 2 decimali");
  assert.equal(combinaSconti([12.345]), null);
  assert.deepEqual(combinaSconti([]), { sconto1: 0, sconto2: 0 });
});

test("OLIGI5: storico 2,28 −15 % → sconto 15 % sul listino di oggi", () => {
  const { condizione } = risolvi(2.36, storico(2.28, [15, 0]), null, null);
  assert.equal(condizione?.origine, "storico_sconto");
  assert.equal(condizione?.sconto1, 15);
  assert.equal(condizione?.prezzo_accordato, null);
  assert.equal(condizione?.rif, "Ordine 23852 del 06/11/2026: 2,28 −15 %");
  assert.equal(centesimi(2.36 * (1 - 15 / 100)), 2.01);
});

test("MOZGIU1: storico 6,90 senza sconti sotto il listino 9,24 → prezzo speciale", () => {
  const { condizione } = risolvi(9.24, storico(6.9), null, null);
  assert.equal(condizione?.origine, "storico_ps");
  assert.equal(condizione?.prezzo_accordato, 6.9);
  assert.equal(condizione?.valido_dal, "2026-11-06");
});

test("storico a prezzo pieno o sopra il listino: si passa alle condizioni NTS, poi al listino", () => {
  assert.equal(risolvi(9.24, storico(9.24), null, null).condizione, null);
  assert.equal(risolvi(9.24, storico(9.5), null, null).condizione, null);
  const nts = risolvi(9.24, storico(9.24), null, { sconti: [10, 0], dal: new Date(2024, 0, 1), al: new Date(2099, 11, 31) }).condizione;
  assert.equal(nts?.origine, "nts_sconto");
  assert.equal(nts?.valido_al, null, "2099 = senza scadenza");
});

test("priorità: storico prima del prezzo personale NTS, che viene prima dello sconto NTS", () => {
  const personale = { prezzo: 7, dal: new Date(2024, 7, 31), al: new Date(2026, 11, 31) };
  const sconto = { sconti: [5], dal: null, al: null };
  assert.equal(risolvi(9.24, storico(6.9), personale, sconto).condizione?.origine, "storico_ps");
  const p = risolvi(9.24, null, personale, sconto).condizione;
  assert.equal(p?.origine, "nts_prezzo");
  assert.equal(p?.prezzo_accordato, 7);
  assert.equal(p?.valido_al, "2026-12-31");
  assert.equal(risolvi(9.24, null, null, sconto).condizione?.origine, "nts_sconto");
  assert.equal(risolvi(9.24, null, null, null).condizione, null);
});

test("articolo senza listino: lo storico diventa prezzo fisso (netto al centesimo)", () => {
  const c = risolvi(null, storico(10, [15]), null, null).condizione;
  assert.equal(c?.origine, "storico_ps");
  assert.equal(c?.prezzo_accordato, 8.5);
  assert.equal(risolvi(null, storico(4), null, null).condizione?.prezzo_accordato, 4);
});

test("sconti non riducibili: scartati e segnalati, si prova la condizione successiva", () => {
  const r = risolvi(10, storico(10, [10, 3, 3, 3]), null, { sconti: [12], dal: null, al: null });
  assert.equal(r.condizione?.origine, "nts_sconto");
  assert.equal(r.scarti.length, 1);
});

test("listino del cliente: 0 o assente → 2", () => {
  assert.equal(listinoCliente(0), 2);
  assert.equal(listinoCliente(null), 2);
  assert.equal(listinoCliente(1), 1);
  assert.equal(listinoCliente(2), 2);
});

test("omaggi (sconto 100 %): mai una condizione, si passa alla regola successiva", async () => {
  const { omaggio } = await import("./prezzi.js");
  assert.equal(omaggio([100, 0]), true);
  assert.equal(omaggio([0, 100]), true);
  assert.equal(omaggio([50, 50]), false);
  assert.equal(omaggio([0, 0]), false);
  const solo = risolvi(12.91, storico(12.91, [100, 0]), null, null);
  assert.equal(solo.condizione, null, "storico in omaggio e niente altro: vale il listino");
  assert.match(solo.scarti[0].motivo, /omaggio/);
  assert.equal(risolvi(12.91, storico(12.91, [100]), null, { sconti: [10], dal: null, al: null }).condizione?.origine, "nts_sconto");
  const ntsTotale = risolvi(9, null, null, { sconti: [100], dal: null, al: null });
  assert.equal(ntsTotale.condizione, null);
  assert.match(ntsTotale.scarti[0].motivo, /100 %/);
  assert.equal(risolvi(10, storico(10, [50, 50]), null, null).condizione?.origine, "storico_sconto", "75 % resta: è solo da controllare");
});
