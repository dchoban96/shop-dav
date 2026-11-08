import assert from "node:assert/strict";
import { test } from "node:test";
import { colonneChiave, colonnePrezzi, quota, tabellaTesto, valorePerParametro, type CasoProva } from "./esplorazione.js";

const caso: CasoProva = { cliente: 140199999, articolo: "OLIGI5", um: "PZ", listino: 2, ditta: "DAVNTS", oggi: new Date(2026, 10, 9) };

test("nomi SQL quotati, anche con parentesi quadre", () => {
  assert.equal(quota("listini"), "[listini]");
  assert.equal(quota("a]b"), "[a]]b]");
});

test("parametri della funzione prezzo: valori dedotti dal nome", () => {
  const v = (nome: string, tipo = "varchar") => valorePerParametro({ nome, tipo }, caso)?.valore;
  assert.equal(v("@codditt"), "DAVNTS");
  assert.equal(v("@strCodart"), "OLIGI5");
  assert.equal(v("@lConto", "int"), 140199999);
  assert.equal(v("@nListino", "smallint"), 2);
  assert.deepEqual(v("@dtData", "datetime"), new Date(2026, 10, 9));
  assert.equal(v("@dQuant", "decimal"), 1);
  assert.equal(v("@strUnmis"), "PZ");
  assert.equal(valorePerParametro({ nome: "@xyz", tipo: "int" }, caso), undefined);
});

test("colonne chiave e colonne utili ai prezzi (niente indirizzi né P. IVA)", () => {
  assert.deepEqual(colonneChiave(["codditt", "lc_codart", "lc_conto", "lc_prezzo"]), { articolo: ["lc_codart"], cliente: ["lc_conto"] });
  const anagra = colonnePrezzi(["an_conto", "an_descr1", "an_indir", "an_pariva", "an_listino", "an_clscan", "an_email"], "anagra");
  assert.deepEqual(anagra, ["an_conto", "an_descr1", "an_listino", "an_clscan"]);
  assert.deepEqual(colonnePrezzi(["ar_codart", "ar_descr", "ar_unmis", "ar_famprod", "ar_clascon", "ar_peso"], "artico"), ["ar_codart", "ar_descr", "ar_unmis", "ar_famprod", "ar_clascon"]);
});

test("tabella di testo allineata e limitata", () => {
  const t = tabellaTesto([{ a: 1, b: "x" }, { a: 22, b: null }], 1);
  assert.equal(t[0], "  a | b");
  assert.equal(t[2], "  1 | x");
  assert.match(t[3], /altre 1 righe/);
  assert.deepEqual(tabellaTesto([]), ["  (nessuna riga)"]);
});
