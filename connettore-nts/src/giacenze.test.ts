import assert from "node:assert/strict";
import { test } from "node:test";
import { differenze, giacenzeShop, SincronizzaGiacenze, type Giacenza } from "./giacenze.js";

test("giacenza per ogni articolo dello shop: NTS o 0", () => {
  const g = giacenzeShop(["OLIGI5", "MOZGIU1", "NUOVO"], [
    { codart: "OLIGI5 ", esist: 715 },
    { codart: "mozgiu1", esist: 267.0004 },
    { codart: "NONNELLOSHOP", esist: 9 },
  ]);
  assert.deepEqual([...g], [["OLIGI5", 715], ["MOZGIU1", 267], ["NUOVO", 0]]);
});

test("negative restano negative (nello shop = su ordinazione)", () => {
  assert.equal(giacenzeShop(["X"], [{ codart: "X", esist: -3 }]).get("X"), -3);
});

test("solo le giacenze cambiate", () => {
  const nuove = new Map([["A", 10], ["B", 0], ["C", 5]]);
  const attuali = new Map([["A", 10], ["B", 2]]);
  assert.deepEqual(differenze(nuove, attuali), [{ cod_dav: "B", quantita: 0 }, { cod_dav: "C", quantita: 5 }]);
});

test("ogni 15 minuti, scrive solo le differenze, riprova dopo un errore", async () => {
  let ora = 0;
  let nts = [{ codart: "A", esist: 10 }];
  let guasto = false;
  const scritte: Giacenza[][] = [];
  const attuali = new Map<string, number>();
  const s = new SincronizzaGiacenze(15, async () => {
    if (guasto) throw new Error("SQL giù");
    return nts;
  }, {
    codiciArticoli: async () => ["A", "B"],
    giacenzeAttuali: async () => new Map(attuali),
    scriviGiacenze: async (r) => {
      scritte.push(r);
      for (const x of r) attuali.set(x.cod_dav, x.quantita);
    },
  }, () => ora);

  const primo = await s.forse();
  assert.equal(primo?.cambiate, 2);
  assert.equal(primo?.disponibili, 1);
  ora += 5 * 60000;
  assert.equal(await s.forse(), null, "dopo 5 minuti non riparte");
  ora += 10 * 60000;
  nts = [{ codart: "A", esist: 0 }];
  assert.equal((await s.forse())?.cambiate, 1);
  assert.deepEqual(scritte.at(-1), [{ cod_dav: "A", quantita: 0 }]);
  ora += 15 * 60000;
  guasto = true;
  assert.equal(await s.forse(), null);
  guasto = false;
  assert.equal((await s.forse())?.cambiate, 0, "subito al giro dopo l'errore, niente da cambiare");
});

test("prova: legge e confronta ma non scrive", async () => {
  let scritto = false;
  const s = new SincronizzaGiacenze(0, async () => [{ codart: "A", esist: 1 }], {
    codiciArticoli: async () => ["A"],
    giacenzeAttuali: async () => new Map(),
    scriviGiacenze: async () => {
      scritto = true;
    },
  });
  assert.equal(s.attiva, false);
  assert.equal(await s.forse(), null);
  const e = await s.esegui(false);
  assert.equal(e.cambiate, 1);
  assert.equal(scritto, false);
});
