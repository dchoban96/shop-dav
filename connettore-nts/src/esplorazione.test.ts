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

test("parametri reali di FNMG_GPH_PREZZO_LISTART2 (letti dal server il 10/11/2026)", () => {
  const v = (nome: string, tipo: string) => valorePerParametro({ nome, tipo }, caso)?.valore;
  assert.equal(v("@DITTA", "varchar"), "DAVNTS");
  assert.equal(v("@CODICE_ARTICOLO", "varchar"), "OLIGI5");
  assert.equal(v("@NUMERO_LISTINO", "decimal"), 2);
  assert.equal(v("@TIPOLISTINO", "decimal"), 1);
  assert.deepEqual(v("@DATA_ELABORAZIONE", "datetime"), new Date(2026, 10, 9));
  assert.equal(v("@VARIANTE_ARTICOLO", "char"), "");
  assert.equal(v("@CODICE_VALUTA", "smallint"), 0);
  assert.equal(v("@CAMBIO", "decimal"), 0);
  assert.equal(v("@NOSCONTILISTINO1", "decimal"), 0);
  assert.equal(v("@PREZZOART_VAR_INVERTIGAMMA", "decimal"), 0);
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

test("documenti: colonne riservate escluse, chiave documento e colonne scadenza riconosciute", async () => {
  const { chiaveDocumento, colonneAmmesse, colonneElencoTestate, colonneScadenza, verticale } = await import("./esplorazione.js");
  assert.deepEqual(colonneAmmesse(["tm_totdoc", "tm_costo", "tm_provv1", "tm_fido", "tm_note", "tm_margine"]), ["tm_totdoc"]);
  assert.deepEqual(chiaveDocumento(["codditt", "cm_tipork", "cm_anno", "cm_serie", "cm_numdoc", "cm_codiva"]), {
    tipork: "cm_tipork",
    anno: "cm_anno",
    serie: "cm_serie",
    numdoc: "cm_numdoc",
  });
  assert.equal(chiaveDocumento(["sc_conto", "sc_datscad"]), null);
  assert.deepEqual(colonneScadenza(["codditt", "sc_conto", "sc_datscad", "sc_import"]), { conto: ["sc_conto"], data: "sc_datscad" });
  const elenco = colonneElencoTestate(["codditt", "tm_tipork", "tm_anno", "tm_serie", "tm_numdoc", "tm_datdoc", "tm_conto", "tm_totdoc", "tm_indir", "tm_costo", "tm_colli"]);
  assert.deepEqual(elenco, ["tm_tipork", "tm_anno", "tm_serie", "tm_numdoc", "tm_datdoc", "tm_conto", "tm_totdoc", "tm_colli"]);
  assert.deepEqual(verticale({ tm_numdoc: 18931, tm_costo: 1, tm_datdoc: null }), ["  tm_numdoc                18931", "  tm_datdoc                NULL"]);
});
