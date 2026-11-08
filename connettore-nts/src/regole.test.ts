import assert from "node:assert/strict";
import { test } from "node:test";
import { annoOrdine, controllaDecimale, contoNts, ErroreOrdine, noteTestata, preparaOrdine, type OrdineShop } from "./regole.js";
import { articoli, colRiga, colTestata, ordineProva } from "./test/dati.js";

const ctx = { colTestata, colRiga, articoli, usaDataCons: false };

test("ricetta: prezzo e sconti, prezzo accordato senza sconti, nota di riga D subito dopo", () => {
  const p = preparaOrdine(ordineProva(), ctx);
  assert.equal(p.riferimento, "SHOP-000123");
  assert.equal(p.conto, 140199999);
  assert.equal(p.note, "PROVA SHOP - NON EVADERE - Consegna richiesta: 10/11/2026");
  assert.deepEqual(p.righe, [
    { tipo: "articolo", nr: 1, codice: "DOLFOR", quantita: 25, prezzo: 5.26, sconto1: 10, sconto2: 5, um: "KG" },
    { tipo: "nota", nr: 2, testo: "nota di riga dallo shop" },
    { tipo: "articolo", nr: 3, codice: "MOZGIU1", quantita: 12, prezzo: 7.1, sconto1: 0, sconto2: 0, um: "PZ" },
  ]);
  assert.equal(p.dataCons, null);
});

test("data documento e anno nel fuso di Roma", () => {
  const p = preparaOrdine(ordineProva({ creato_il: "2026-12-31T23:30:00Z" }), ctx);
  assert.equal(p.anno, 2027);
  assert.equal(p.dataDoc.getFullYear(), 2027);
  assert.equal(annoOrdine("2026-12-31T22:30:00Z"), 2026);
});

test("DATA_CONS solo se richiesta", () => {
  const p = preparaOrdine(ordineProva(), { ...ctx, usaDataCons: true });
  assert.equal(p.dataCons?.getDate(), 10);
  assert.equal(p.dataCons?.getMonth(), 10);
});

test("decimali: zeri finali ignorati, troppi decimali è errore (niente arrotondamenti)", () => {
  const c = colRiga.get("PREZZO");
  assert.equal(controllaDecimale("5.2600", c, "p"), 5.26);
  assert.throws(() => controllaDecimale("5.26001", c, "p"), ErroreOrdine);
  assert.throws(() => controllaDecimale("abc", c, "p"), ErroreOrdine);
  assert.throws(() => controllaDecimale("12345678901234567", c, "p"), ErroreOrdine);
  const due = { nome: "PREZZO", tipo: "decimal", precisione: 18, scala: 2, lunghezza: 0 };
  const quattro = ordineProva({ righe: [{ ...ordineProva().righe[0], prezzo_listino: "5.2650" }] });
  assert.throws(() => preparaOrdine(quattro, { ...ctx, colRiga: new Map([...colRiga, ["PREZZO", due]]) }), /più di 2 decimali/);
  assert.doesNotThrow(() => preparaOrdine(ordineProva(), { ...ctx, colRiga: new Map([...colRiga, ["PREZZO", due]]) }));
});

test("controlli che mandano l'ordine in errore", () => {
  const conRiga = (r: Partial<OrdineShop["righe"][number]>) => ordineProva({ righe: [{ ...ordineProva().righe[0], note: null, ...r }] });
  assert.throws(() => preparaOrdine(conRiga({ cod_dav: "NONCE" }), ctx), /non trovato in NTS/);
  assert.throws(() => preparaOrdine(conRiga({ cod_dav: "BLOCC", um: "PZ" }), ctx), /bloccato/);
  assert.throws(() => preparaOrdine(conRiga({ um: "CT" }), ctx), /unità di misura diversa/);
  assert.throws(() => preparaOrdine(conRiga({ quantita: "0" }), ctx), /quantità non valida/);
  assert.throws(() => preparaOrdine(conRiga({ prezzo_listino: "0.0000" }), ctx), /prezzo zero/);
  assert.throws(() => preparaOrdine(conRiga({ prezzo_listino: null }), ctx), /listino mancante/);
  assert.throws(() => preparaOrdine(conRiga({ sconto1: "120" }), ctx), /sconto fuori/);
  assert.throws(() => preparaOrdine(ordineProva({ righe: [] }), ctx), /senza righe/);
  assert.throws(() => preparaOrdine(ordineProva({ riferimento_nts: "X-1" }), ctx), /Riferimento non valido/);
  assert.throws(() => contoNts("DEMO1"), /non valido/);
});

test("UM vuota nello shop: vale quella di NTS", () => {
  const p = preparaOrdine(ordineProva({ righe: [{ ...ordineProva().righe[0], um: null, note: null }] }), ctx);
  assert.equal(p.righe[0].tipo === "articolo" && p.righe[0].um, "KG");
});

test("testi lunghi: troncati e annotati", () => {
  const lunga = "x".repeat(300);
  const p = preparaOrdine(ordineProva({ note: lunga, righe: [{ ...ordineProva().righe[0], note: lunga }] }), ctx);
  assert.equal(p.note.length, 200);
  const nota = p.righe[1];
  assert.equal(nota.tipo === "nota" && nota.testo.length, 255);
  assert.equal(p.avvisi.length, 2);
});

test("note di testata senza nota del cliente", () => {
  assert.equal(noteTestata(null, "2026-01-05"), "Consegna richiesta: 05/01/2026");
  assert.equal(noteTestata("  a\n b ", null), "a b");
});
