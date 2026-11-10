/**
 * Il giro del connettore con SQL Server e Supabase finti: ripercorre il piano di prova del brief
 * (sezione 7) senza toccare niente di vero.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Config } from "./config.js";
import { Connettore, TEMPI, type PortaNts, type PortaShop } from "./giro.js";
import { ErroreScrittura, type EsitoFrontiera } from "./nts.js";
import type { OrdinePreparato, OrdineShop } from "./regole.js";
import { articoli, colRiga, colTestata, ordineProva } from "./test/dati.js";
import type { OrdineInCorso, Passaggio, StatoNts } from "./shop.js";

const cfgBase: Config = {
  mssql: { server: "x", utente: "sa", password: "x", trustServerCertificate: true },
  supabase: { url: "x", chiave: "x" },
  pollSecondi: 30,
  prova: false,
  clientiAbilitati: ["140199999"],
  emailAllarmi: "info@davsnc.it",
  resendApiKey: "",
  emailMittente: "x",
  appUrl: "https://shop",
  colonnaRiferimentoTestord: null,
  usaDataCons: false,
  simulaCrashDopoCommit: false,
  giacenzeMinuti: 0,
};

type OrdineFinto = { o: OrdineShop; stato: StatoNts; idFrontiera: number | null; numeroNts: number | null; inInvioIl: number; inFrontieraIl: number | null; provaOk: boolean };

class ShopFinto implements PortaShop {
  ordini = new Map<number, OrdineFinto>();
  registro: { id: number; evento: string; dettaglio: string }[] = [];
  battiti: Record<string, unknown>[] = [];
  /** Impostazioni dello shop: null = non salvate. */
  abilitatiShop: string[] | null = null;
  constructor(private ora: () => number) {}
  aggiungi(o: OrdineShop) {
    this.ordini.set(o.id, { o, stato: "da_inviare", idFrontiera: null, numeroNts: null, inInvioIl: 0, inFrontieraIl: null, provaOk: false });
  }
  async claim(n: number, prova: boolean) {
    const presi = [...this.ordini.values()].filter((x) => x.stato === "da_inviare" && !(prova && x.provaOk)).slice(0, n);
    for (const x of presi) {
      x.stato = "in_invio";
      x.inInvioIl = this.ora();
      x.o = { ...x.o, tentativi_nts: x.o.tentativi_nts + 1 };
    }
    return presi.map((x) => x.o);
  }
  async passa(id: number, da: StatoNts[], a: StatoNts, p: Passaggio = {}) {
    const x = this.ordini.get(id)!;
    if (!da.includes(x.stato)) return false;
    x.stato = a;
    if (p.idFrontiera) x.idFrontiera = p.idFrontiera;
    if (p.numeroNts) x.numeroNts = p.numeroNts;
    if (a === "in_frontiera") x.inFrontieraIl ??= this.ora();
    if (p.provaOk) x.provaOk = true;
    this.registro.push({ id, evento: p.evento ?? a, dettaglio: p.dettaglio ?? p.errore ?? "" });
    return true;
  }
  async log(id: number, evento: string, dettaglio: string) {
    this.registro.push({ id, evento, dettaglio });
  }
  async inInvioDaTroppo(minuti: number) {
    return [...this.ordini.values()].filter((x) => x.stato === "in_invio" && this.ora() - x.inInvioIl > minuti * 60000).map((x) => this.inCorso(x));
  }
  async inAttesaDiEsito() {
    return [...this.ordini.values()].filter((x) => x.idFrontiera && (x.stato === "in_frontiera" || x.stato === "da_verificare")).map((x) => this.inCorso(x));
  }
  private inCorso(x: OrdineFinto): OrdineInCorso {
    return {
      id: x.o.id,
      numero: x.o.numero,
      riferimento_nts: x.o.riferimento_nts!,
      stato_nts: x.stato,
      id_frontiera: x.idFrontiera,
      creato_il: x.o.creato_il,
      in_invio_il: new Date(x.inInvioIl).toISOString(),
      in_frontiera_il: x.inFrontieraIl ? new Date(x.inFrontieraIl).toISOString() : null,
      cliente: x.o.cliente,
    };
  }
  async righePerEmail(id: number) {
    return this.ordini.get(id)!.o.righe;
  }
  async heartbeat(v: Record<string, unknown>) {
    this.battiti.push(v);
  }
  async clientiAbilitati() {
    return this.abilitatiShop;
  }
}
function shopFinto(ora: () => number): ShopFinto {
  return new ShopFinto(ora);
}

class NtsFinto implements PortaNts {
  colTestata = colTestata;
  colRiga = colRiga;
  haColonnaRiferimento = false;
  giu = false;
  testate = new Map<number, EsitoFrontiera & { rif: string; conto: number }>();
  scritture: { prep: OrdinePreparato; prova: boolean }[] = [];
  testord = new Set<string>();
  clienti = new Set([140199999]);
  prossimoId = 5000;
  erroreScrittura: ErroreScrittura | Error | null = null;
  async connetti() {
    if (this.giu) throw new Error("ETIMEOUT");
  }
  async cercaRiferimento(rif: string) {
    const t = [...this.testate.values()].filter((x) => x.rif === rif).at(-1);
    return t ?? null;
  }
  async esito(id: number) {
    return this.testate.get(id) ?? null;
  }
  async clienteEsiste(conto: number) {
    return this.clienti.has(conto);
  }
  async articoli() {
    return articoli;
  }
  async ordineInTestord(anno: number, numero: number, conto: number) {
    return this.testord.has(`${anno}/${numero}/${conto}`);
  }
  async testordPerRiferimento() {
    return null;
  }
  async scrivi(prep: OrdinePreparato, prova: boolean) {
    if (this.erroreScrittura) throw this.erroreScrittura;
    this.scritture.push({ prep, prova });
    const id = this.prossimoId++;
    if (!prova) this.testate.set(id, { id, stato: "N", numero: null, logErrori: "", rif: prep.riferimento, conto: prep.conto });
    return { id, righe: prep.righe.length, dataIns: new Date() };
  }
  /** Il servizio NTS elabora la testata: numero assegnato e ordine in testord. */
  elabora(id: number, numero: number) {
    const t = this.testate.get(id)!;
    t.stato = "C";
    t.numero = numero;
    this.testord.add(`2026/${numero}/${t.conto}`);
  }
}

function ambiente(cfg: Partial<Config> = {}) {
  let ora = Date.parse("2026-11-09T09:00:00Z");
  const shop = shopFinto(() => ora);
  const nts = new NtsFinto();
  const email: string[] = [];
  const c = new Connettore({ ...cfgBase, ...cfg }, nts, shop, async (oggetto) => email.push(oggetto), () => ora);
  return { shop, nts, email, c, avanti: (min: number) => (ora += min * 60000) };
}

test("1. prova a secco: transazione annullata, ordine di nuovo in coda e non ripreso in prova", async () => {
  const { shop, nts, c } = ambiente({ prova: true });
  shop.aggiungi(ordineProva());
  await c.giro();
  assert.equal(nts.scritture.length, 1);
  assert.equal(nts.scritture[0].prova, true);
  assert.equal(nts.testate.size, 0);
  const x = shop.ordini.get(1)!;
  assert.equal(x.stato, "da_inviare");
  assert.ok(shop.registro.some((l) => l.evento === "prova_ok"));
  await c.giro();
  assert.equal(nts.scritture.length, 1, "in prova lo stesso ordine non si riprova a ogni giro");
  assert.equal(shop.battiti.at(-1)?.modalita, "prova");
});

test("2. reale: in frontiera, poi C + controllo in testord → in NTS", async () => {
  const { shop, nts, c } = ambiente();
  shop.aggiungi(ordineProva());
  await c.giro();
  const x = shop.ordini.get(1)!;
  assert.equal(x.stato, "in_frontiera");
  assert.equal(x.idFrontiera, 5000);
  nts.elabora(5000, 777);
  await c.giro();
  assert.equal(x.stato, "in_nts");
  assert.equal(x.numeroNts, 777);
});

test("3. doppione: riferimento già in frontiera → nessuna seconda scrittura", async () => {
  const { shop, nts, c } = ambiente();
  shop.aggiungi(ordineProva());
  await c.giro();
  shop.ordini.get(1)!.stato = "da_inviare"; // rimesso a mano in coda
  await c.giro();
  assert.equal(nts.scritture.length, 1);
  assert.equal(shop.ordini.get(1)!.stato, "in_frontiera");
  assert.ok(shop.registro.some((l) => l.evento === "gia_in_frontiera"));
});

test("4. errore: articolo o cliente inesistente → errore + email, niente in frontiera", async () => {
  const { shop, nts, c, email } = ambiente();
  shop.aggiungi(ordineProva({ righe: [{ ...ordineProva().righe[0], cod_dav: "NONCE" }] }));
  shop.aggiungi(ordineProva({ id: 2, riferimento_nts: "SHOP-000124", cliente: { id: 9, codice_nts: "140199999", ragione_sociale: "X" } }));
  nts.clienti.clear();
  await c.giro();
  assert.equal(nts.scritture.length, 0);
  assert.equal(shop.ordini.get(1)!.stato, "errore");
  assert.equal(shop.ordini.get(2)!.stato, "errore");
  assert.equal(email.length, 2);
  assert.match(email[0], /\[SHOP-000123\] Ordine shop in ERRORE/);
});

test("cliente non abilitato → errore con email, niente in frontiera", async () => {
  const { shop, nts, c, email } = ambiente();
  shop.aggiungi(ordineProva({ cliente: { id: 1, codice_nts: "140100001", ragione_sociale: "Altro" } }));
  await c.giro();
  assert.equal(nts.scritture.length, 0);
  assert.equal(shop.ordini.get(1)!.stato, "errore");
  assert.equal(email.length, 1);
});

test("Impostazioni dello shop: 'tutti' vince sul .env, riletto a ogni giro", async () => {
  const { shop, nts, c } = ambiente();
  nts.clienti.add(140100001);
  shop.abilitatiShop = [];
  shop.aggiungi(ordineProva({ cliente: { id: 1, codice_nts: "140100001", ragione_sociale: "Altro" } }));
  await c.giro();
  assert.equal(nts.scritture.length, 1);
  assert.equal(shop.ordini.get(1)!.stato, "in_frontiera");
  assert.equal(shop.battiti.at(-1)!.clienti_abilitati, null);
  assert.equal(shop.battiti.at(-1)!.clienti_da, "shop");

  shop.abilitatiShop = ["140199999"];
  shop.aggiungi(ordineProva({ id: 2, numero: 124, riferimento_nts: "SHOP-000124", cliente: { id: 1, codice_nts: "140100001", ragione_sociale: "Altro" } }));
  await c.giro();
  assert.equal(shop.ordini.get(2)!.stato, "errore");
  assert.match(shop.registro.find((r) => r.id === 2)!.dettaglio, /Impostazioni dello shop/);
});

test("lettura delle Impostazioni non riuscita: nessun claim", async () => {
  const { shop, nts, c } = ambiente();
  shop.clientiAbilitati = async () => {
    throw new Error("Supabase giù");
  };
  shop.aggiungi(ordineProva());
  const r = await c.giro();
  assert.match(r.errore ?? "", /invio: Supabase giù/);
  assert.equal(shop.ordini.get(1)!.stato, "da_inviare");
  assert.equal(nts.scritture.length, 0);
});

test("5. crash dopo il COMMIT: il recupero trova il riferimento e non reinvia", async () => {
  const { shop, nts, c, avanti } = ambiente({ simulaCrashDopoCommit: true });
  let crash = 0;
  c.crash = (() => void crash++) as unknown as () => never;
  shop.aggiungi(ordineProva());
  await c.giro();
  assert.equal(crash, 1);
  assert.equal(shop.ordini.get(1)!.stato, "in_invio");
  assert.equal(nts.scritture.length, 1);
  // riavvio senza simulazione
  const c2 = new Connettore(cfgBase, nts, shop, async () => undefined, () => Date.parse("2026-11-09T09:03:00Z"));
  avanti(3);
  await c2.giro();
  assert.equal(nts.scritture.length, 1, "nessuna seconda scrittura");
  assert.equal(shop.ordini.get(1)!.stato, "in_frontiera");
  assert.equal(shop.ordini.get(1)!.idFrontiera, 5000);
});

test("crash prima del COMMIT: il recupero lo rimette in coda", async () => {
  const { shop, c, avanti } = ambiente();
  shop.aggiungi(ordineProva());
  await shop.claim(5, false);
  avanti(3);
  await c.recupero();
  assert.equal(shop.ordini.get(1)!.stato, "da_inviare");
});

test("6. SQL Server giù: ordine resta in coda, heartbeat sql_ok=false, allarme dopo 5 minuti una volta", async () => {
  const { shop, nts, c, email, avanti } = ambiente();
  shop.aggiungi(ordineProva());
  nts.giu = true;
  await c.giro();
  assert.equal(shop.ordini.get(1)!.stato, "da_inviare");
  assert.equal(shop.battiti.at(-1)?.sql_ok, false);
  assert.equal(email.length, 0);
  avanti(6);
  await c.giro();
  avanti(1);
  await c.giro();
  assert.equal(email.length, 1);
  assert.match(email[0], /irraggiungibile/);
  nts.giu = false;
  await c.giro();
  assert.equal(shop.ordini.get(1)!.stato, "in_frontiera");
});

test("errore tecnico prima del COMMIT: si riprova, dopo il massimo dei tentativi → errore", async () => {
  const { shop, nts, c, email } = ambiente();
  shop.aggiungi(ordineProva({ tentativi_nts: 0 }));
  nts.erroreScrittura = new ErroreScrittura(new Error("timeout"), false);
  for (let i = 1; i < TEMPI.maxTentativi; i++) {
    await c.giro();
    assert.equal(shop.ordini.get(1)!.stato, "da_inviare");
  }
  await c.giro();
  assert.equal(shop.ordini.get(1)!.stato, "errore");
  assert.equal(email.length, 1);
});

test("COMMIT dall'esito incerto: resta in invio per il recupero", async () => {
  const { shop, nts, c } = ambiente();
  shop.aggiungi(ordineProva());
  nts.erroreScrittura = new ErroreScrittura(new Error("connessione persa"), true);
  await c.giro();
  assert.equal(shop.ordini.get(1)!.stato, "in_invio");
  assert.ok(shop.registro.some((l) => l.evento === "commit_incerto"));
});

test("esito: N dopo 5 minuti → da verificare con una sola email; poi C → in NTS", async () => {
  const { shop, nts, c, email, avanti } = ambiente();
  shop.aggiungi(ordineProva());
  await c.giro();
  avanti(6);
  await c.giro();
  assert.equal(shop.ordini.get(1)!.stato, "da_verificare");
  await c.giro();
  assert.equal(email.length, 1);
  nts.elabora(5000, 12);
  await c.giro();
  assert.equal(shop.ordini.get(1)!.stato, "in_nts");
});

test("esito: LOG_ERRORI → errore; C senza ordine in testord → da verificare", async () => {
  const { shop, nts, c, email } = ambiente();
  shop.aggiungi(ordineProva());
  shop.aggiungi(ordineProva({ id: 2, riferimento_nts: "SHOP-000124" }));
  await c.giro();
  nts.testate.get(5000)!.logErrori = "Articolo non valido";
  const t = nts.testate.get(5001)!;
  t.stato = "C";
  t.numero = 99;
  await c.giro();
  assert.equal(shop.ordini.get(1)!.stato, "errore");
  assert.equal(shop.ordini.get(2)!.stato, "da_verificare");
  assert.equal(email.length, 2);
});

test("SQL Server: date in ora locale (useUTC false) per connettore e strumenti", async () => {
  const { configurazioneSql } = await import("./nts.js");
  const c = configurazioneSql(cfgBase, "prova", { requestTimeout: 60000 });
  assert.equal(c.options?.useUTC, false);
  assert.equal(c.requestTimeout, 60000);
  assert.equal(c.database, "NTS_FRONTIERA");
});

test("registro dell'ordine: DATA_INS scritta in ora locale", async () => {
  const { shop, c } = ambiente();
  shop.aggiungi(ordineProva());
  await c.giro();
  const voce = shop.registro.find((l) => l.evento === "in_frontiera");
  assert.match(voce?.dettaglio ?? "", /DATA_DOC \d{2}\/\d{2}\/\d{4}, DATA_INS \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2} \(ora locale\)/);
});
