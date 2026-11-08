/** Dati di prova condivisi dai test (non compilati nel connettore). */
import type { Colonne, OrdineShop } from "../regole.js";

const col = (nome: string, tipo: string, precisione = 0, scala = 0, lunghezza = 0) => [nome, { nome, tipo, precisione, scala, lunghezza }] as const;
export const colTestata: Colonne = new Map([col("NOTE", "nvarchar", 0, 0, 200), col("RIFERIMENTO", "nvarchar", 0, 0, 50), col("CONTO", "int")]);
export const colRiga: Colonne = new Map([
  col("QUANTITA", "decimal", 18, 3),
  col("PREZZO", "decimal", 18, 4),
  col("SCONTO1", "decimal", 9, 3),
  col("SCONTO2", "decimal", 9, 3),
  col("CODICE_ART", "varchar", 0, 0, 20),
  col("UM", "varchar", 0, 0, 3),
  col("DESCRIZIONE", "nvarchar", 0, 0, 255),
]);
export const articoli = new Map([
  ["DOLFOR", { codice: "DOLFOR", um: "KG", bloccato: false }],
  ["MOZGIU1", { codice: "MOZGIU1", um: "PZ", bloccato: false }],
  ["BLOCC", { codice: "BLOCC", um: "PZ", bloccato: true }],
]);

export function ordineProva(over: Partial<OrdineShop> = {}): OrdineShop {
  return {
    id: 1,
    numero: 123,
    riferimento_nts: "SHOP-000123",
    creato_il: "2026-11-08T22:30:00Z", // 23:30 a Roma
    data_consegna_richiesta: "2026-11-10",
    note: "PROVA SHOP - NON EVADERE",
    tentativi_nts: 1,
    cliente: { id: 9, codice_nts: "140199999", ragione_sociale: "CLIENTE DI PROVA" },
    righe: [
      { id: 1, cod_dav: "dolfor", descrizione: "Dolce", quantita: "25.000", um: "KG", prezzo_listino: "5.2600", sconto1: "10.000", sconto2: "5.000", prezzo_accordato: null, note: "nota di riga dallo shop" },
      { id: 2, cod_dav: "MOZGIU1", descrizione: "Mozzarella", quantita: "12.000", um: "PZ", prezzo_listino: "9.0000", sconto1: "10.000", sconto2: "0.000", prezzo_accordato: "7.1000", note: null },
    ],
    ...over,
  };
}

