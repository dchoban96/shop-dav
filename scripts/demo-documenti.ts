/**
 * Documenti di PROVA per i clienti demo (DEMO1, DEMO2, …): DDT, fatture differite mensili,
 * una nota di credito, riepilogo IVA e scadenze, con articoli veri del catalogo e totali coerenti.
 * Servono a vedere e provare le pagine /ordini (DDT, Fatture) e /pagamenti finché il connettore
 * non sincronizza i documenti veri da NTS.
 *
 *   npm run demo-documenti                       # clienti di DEMO_CODICI_CLIENTE (o DEMO1,DEMO2,DEMO3)
 *   npm run demo-documenti -- --clienti DEMO1    # solo alcuni
 *   npm run demo-documenti -- --cancella         # toglie tutti i documenti di prova di quei clienti
 *
 * Regole: tocca SOLO clienti con demo = true (li crea se mancano, come fa il login demo) e solo
 * righe con chiave_nts che inizia per "DEMO:". Rilanciarlo rigenera gli stessi documenti.
 * Se un cliente demo ha un ordine dello shop già inviato, l'ultimo DDT lo cita (SHOP-…) e
 * l'ordine passa a "consegnato": è il collegamento DDT → ordine dello shop da provare.
 * Usa il service role (bypassa RLS). Richiede la migrazione 0009.
 */
import { existsSync } from "node:fs";
import { supabaseAdmin } from "../src/lib/supabase/admin";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const PREFISSO = "DEMO:";

type Articolo = { cod_dav: string; descrizione_nts: string; um: string | null; prezzo_listino: number; iva: number | null };
type Riga = {
  riga: number;
  tipo_riga: "articolo" | "nota";
  cod_dav: string | null;
  descrizione: string;
  cod_fornitore: string | null;
  um: string | null;
  quantita: number | null;
  prezzo: number | null;
  sconti_testo: string | null;
  importo: number | null;
  codice_iva: string | null;
  aliquota_iva: number | null;
  lotto: string | null;
  scadenza_lotto: string | null;
  rif_ddt_numero?: number | null;
  rif_ddt_data?: string | null;
  rif_ordine_anno?: number | null;
  rif_ordine_numero?: number | null;
  rif_ordine_data?: string | null;
  rif_ordine_shop?: string | null;
};
type Doc = {
  chiave_nts: string;
  tipo: "ddt" | "fattura" | "nota_credito";
  sottotipo: string | null;
  anno: number;
  numero: number;
  data_doc: string;
  righe: Riga[];
  extra: Record<string, unknown>;
};
type ProfiloPagamento = { codice: string; desc: string; giorni: number; tipo: string };

const PAGAMENTI: ProfiloPagamento[] = [
  { codice: "8", desc: "RIMESSA DIRETTA FINE MESE", giorni: 0, tipo: "Rimessa diretta" },
  { codice: "21", desc: "BONIFICO 30 GG D.F.", giorni: 30, tipo: "Bonifico" },
  { codice: "5", desc: "R.B. 30 GG FM", giorni: 30, tipo: "Ricevuta bancaria" },
];

const GENERICI = ["TORTIGLIONI 2x15", "FRIOL LT.5", "SACCHETTI CARTA 1KG", "TOVAGLIOLI 33X33 PZ.100"];

// Numeri casuali ripetibili (stesso cliente → stessi documenti)
function generatore(seme: string) {
  let h = 2166136261;
  for (const c of seme) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const giorno = (a: number, m: number, g: number) => new Date(Date.UTC(a, m, g));

function argomenti() {
  const a = process.argv.slice(2);
  const i = a.indexOf("--clienti");
  const lista = (i >= 0 ? a[i + 1] : process.env.DEMO_CODICI_CLIENTE || "DEMO1,DEMO2,DEMO3")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  return { clienti: lista, cancella: a.includes("--cancella") };
}

/** Totali per aliquota come in fattura: IVA calcolata sul totale imponibile di ogni aliquota. */
function totali(righe: Riga[]) {
  const per = new Map<number, number>();
  for (const r of righe) if (r.tipo_riga === "articolo" && r.importo !== null) per.set(r.aliquota_iva ?? 10, (per.get(r.aliquota_iva ?? 10) ?? 0) + r.importo);
  const iva = [...per.entries()].map(([aliquota, imp]) => ({ aliquota, imponibile: r2(imp), imposta: r2((imp * aliquota) / 100) }));
  const imponibile = r2(iva.reduce((t, v) => t + v.imponibile, 0));
  const imposta = r2(iva.reduce((t, v) => t + v.imposta, 0));
  return { iva, imponibile, imposta, totale: r2(imponibile + imposta) };
}

export function genera(codice: string, articoli: Articolo[], profilo: ProfiloPagamento, ordineShop: { riferimento: string; righe: { cod_dav: string; quantita: number; prezzo: number | null }[] } | null): { documenti: Doc[]; scadenze: { chiave: string; documento: string; data: string; importo: number; residuo: number; stato: "aperta" | "pagata" | "insoluta" }[] } {
  const rnd = generatore(codice);
  const pesca = <T>(v: T[]) => v[Math.floor(rnd() * v.length)];
  const abituali = [...articoli].sort(() => rnd() - 0.5).slice(0, 28);
  const oggi = new Date();
  const anno0 = oggi.getUTCFullYear();
  const mese0 = oggi.getUTCMonth();
  const contDdt = new Map<number, number>();
  const contFat = new Map<number, number>();
  const prossimo = (m: Map<number, number>, anno: number, base: number, salto: number) => {
    const n = (m.get(anno) ?? base) + 1 + Math.floor(rnd() * salto);
    m.set(anno, n);
    return n;
  };
  const documenti: Doc[] = [];
  const scadenze: ReturnType<typeof genera>["scadenze"] = [];

  const rigaArticolo = (nr: number, a: Articolo, q: number, dataDoc: Date): Riga => {
    const sc = pesca(["", "", "", "5", "10", "10+5"]);
    const fattore = sc ? sc.split("+").reduce((f, s) => f * (1 - Number(s) / 100), 1) : 1;
    const prezzo = r3(a.prezzo_listino);
    const aliquota = a.iva ?? 10;
    const lottoVero = rnd() < 0.55;
    const scadLotto = new Date(dataDoc.getTime() + (60 + Math.floor(rnd() * 300)) * 86400000);
    return {
      riga: nr,
      tipo_riga: "articolo",
      cod_dav: a.cod_dav,
      descrizione: a.descrizione_nts,
      cod_fornitore: rnd() < 0.6 ? String(10000 + Math.floor(rnd() * 89999)) : null,
      um: a.um,
      quantita: q,
      prezzo,
      sconti_testo: sc || null,
      importo: r2(q * prezzo * fattore),
      codice_iva: String(aliquota),
      aliquota_iva: aliquota,
      lotto: lottoVero ? `L${Math.floor(rnd() * 900000 + 100000)}` : "01",
      scadenza_lotto: lottoVero ? iso(scadLotto) : "2099-12-31",
    };
  };

  for (let k = 13; k >= 0; k--) {
    const d0 = giorno(anno0, mese0 - k, 1);
    const anno = d0.getUTCFullYear();
    const mese = d0.getUTCMonth();
    const ultimo = giorno(anno, mese + 1, 0);
    const limite = k === 0 ? oggi.getUTCDate() - 1 : ultimo.getUTCDate();
    const ddtMese: Doc[] = [];
    const nDdt = 3 + Math.floor(rnd() * 3);
    const giorni = [...new Set(Array.from({ length: nDdt }, () => 1 + Math.floor(rnd() * Math.max(1, limite))))].sort((a, b) => a - b);
    for (const g of giorni) {
      const data = giorno(anno, mese, g);
      if (data.getUTCDay() === 0) data.setUTCDate(data.getUTCDate() + 1);
      if (data.getUTCMonth() !== mese || data >= oggi) continue;
      const numero = prossimo(contDdt, anno, 1200, 140);
      const ordNum = 3000 + Math.floor(rnd() * 6000);
      const ordData = iso(new Date(data.getTime() - 86400000));
      const righe: Riga[] = [];
      const n = 3 + Math.floor(rnd() * 7);
      for (const a of [...abituali].sort(() => rnd() - 0.5).slice(0, n)) {
        const q = a.um === "KG" ? r3(1 + Math.floor(rnd() * 20) / 2) : 1 + Math.floor(rnd() * 8);
        righe.push({ ...rigaArticolo(righe.length + 1, a, q, data), rif_ordine_anno: anno, rif_ordine_numero: ordNum, rif_ordine_data: ordData });
      }
      if (rnd() < 0.3) {
        const q = 1 + Math.floor(rnd() * 4);
        const prezzo = r3(2 + rnd() * 20);
        righe.push({
          riga: righe.length + 1, tipo_riga: "articolo", cod_dav: "M", descrizione: pesca(GENERICI), cod_fornitore: null, um: "PZ", quantita: q, prezzo, sconti_testo: null,
          importo: r2(q * prezzo), codice_iva: "22", aliquota_iva: 22, lotto: "01", scadenza_lotto: "2099-12-31", rif_ordine_anno: anno, rif_ordine_numero: ordNum, rif_ordine_data: ordData,
        });
      }
      const t = totali(righe);
      const colli = righe.reduce((s, r) => s + Math.ceil(Number(r.quantita ?? 0)), 0);
      ddtMese.push({
        chiave_nts: `${PREFISSO}${codice}:B/${anno}//${numero}`,
        tipo: "ddt",
        sottotipo: null,
        anno,
        numero,
        data_doc: iso(data),
        righe,
        extra: {
          imponibile: t.imponibile, iva: t.imposta, totale: t.totale, trasporto_a_cura: "Mittente", causale_trasporto: "Vendita", aspetto_esteriore: "Cartoni",
          totale_colli: colli, peso: r3(colli * (0.6 + rnd())), destinazione: "Idem", _iva: t.iva,
        },
      });
    }
    documenti.push(...ddtMese);

    // Fattura differita a fine mese con tutti i DDT del mese (il mese in corso non è ancora fatturato)
    if (k > 0 && ddtMese.length) {
      const numero = prossimo(contFat, anno, 300, 30);
      const righe: Riga[] = [];
      for (const d of ddtMese)
        for (const r of d.righe) righe.push({ ...r, riga: righe.length + 1, rif_ddt_numero: d.numero, rif_ddt_data: d.data_doc, rif_ordine_anno: null, rif_ordine_numero: null, rif_ordine_data: null });
      const t = totali(righe);
      const chiave = `${PREFISSO}${codice}:A/${anno}//${numero}`;
      documenti.push({ chiave_nts: chiave, tipo: "fattura", sottotipo: "differita", anno, numero, data_doc: iso(ultimo), righe, extra: { imponibile: t.imponibile, iva: t.imposta, totale: t.totale, destinazione: "Idem", _iva: t.iva } });
      const scad = new Date(ultimo.getTime() + profilo.giorni * 86400000);
      // Pagate tutte tranne l'ultima fattura (aperta: a rimessa fine mese è già scaduta, con un acconto
      // per DEMO1; a 30 giorni scade a fine mese). Per DEMO2 la penultima è insoluta.
      const stato: "aperta" | "pagata" | "insoluta" = k === 1 ? "aperta" : k === 2 && codice.endsWith("2") ? "insoluta" : "pagata";
      const acconto = stato === "aperta" && k === 1 && codice.endsWith("1") ? r2(t.totale * 0.4) : 0;
      scadenze.push({ chiave: `${chiave}:1`, documento: chiave, data: iso(scad), importo: t.totale, residuo: stato === "pagata" ? 0 : r2(t.totale - acconto), stato });
    }

    // Una nota di credito (reso) cinque mesi fa
    if (k === 5) {
      const a = abituali[0];
      const data = giorno(anno, mese, 12);
      const r = rigaArticolo(1, a, 1, data);
      const t = totali([r]);
      const numero = prossimo(contFat, anno, 300, 5);
      documenti.push({
        chiave_nts: `${PREFISSO}${codice}:N/${anno}//${numero}`, tipo: "nota_credito", sottotipo: null, anno, numero, data_doc: iso(data),
        righe: [r, { riga: 2, tipo_riga: "nota", cod_dav: null, descrizione: "Reso merce non conforme", cod_fornitore: null, um: null, quantita: null, prezzo: null, sconti_testo: null, importo: null, codice_iva: null, aliquota_iva: null, lotto: null, scadenza_lotto: null }],
        extra: { imponibile: t.imponibile, iva: t.imposta, totale: t.totale, _iva: t.iva },
      });
    }
  }

  // DDT di consegna dell'ultimo ordine dello shop (collegamento DDT → ordine dello shop)
  if (ordineShop && ordineShop.righe.length) {
    const ieri = new Date(oggi.getTime() - 86400000);
    const numero = prossimo(contDdt, ieri.getUTCFullYear(), 1200, 40);
    const perCod = new Map(articoli.map((a) => [a.cod_dav, a]));
    const righe: Riga[] = [];
    for (const o of ordineShop.righe) {
      const a = perCod.get(o.cod_dav) ?? { cod_dav: o.cod_dav, descrizione_nts: o.cod_dav, um: null, prezzo_listino: o.prezzo ?? 1, iva: 10 };
      righe.push({ ...rigaArticolo(righe.length + 1, { ...a, prezzo_listino: o.prezzo ?? a.prezzo_listino }, o.quantita, ieri), sconti_testo: null, importo: r2(o.quantita * r3(o.prezzo ?? a.prezzo_listino)), rif_ordine_anno: ieri.getUTCFullYear(), rif_ordine_numero: 9000 + Math.floor(rnd() * 900), rif_ordine_data: iso(ieri), rif_ordine_shop: ordineShop.riferimento });
    }
    const t = totali(righe);
    documenti.push({
      chiave_nts: `${PREFISSO}${codice}:B/${ieri.getUTCFullYear()}//${numero}`, tipo: "ddt", sottotipo: null, anno: ieri.getUTCFullYear(), numero, data_doc: iso(ieri), righe,
      extra: { imponibile: t.imponibile, iva: t.imposta, totale: t.totale, trasporto_a_cura: "Mittente", causale_trasporto: "Vendita", aspetto_esteriore: "Cartoni", totale_colli: righe.length, destinazione: "Idem", _iva: t.iva },
    });
  }
  return { documenti, scadenze };
}

async function main() {
  const { clienti, cancella } = argomenti();
  const db = supabaseAdmin();
  // Lettura vera, non head: con head:true PostgREST non riporta l'errore di tabella mancante.
  const { error: e0 } = await db.from("documenti").select("id").limit(1);
  if (e0) throw new Error(`Tabella documenti non leggibile (migrazione 0009 applicata?): ${e0.message}`);

  const { data: art, error: ea } = await db
    .from("articoli")
    .select("cod_dav, descrizione_nts, um, prezzo_listino, iva")
    .eq("attivo", true)
    .not("prezzo_listino", "is", null)
    .gt("prezzo_listino", 0.5)
    .lt("prezzo_listino", 80)
    .order("cod_dav")
    .limit(600);
  if (ea) throw new Error(`articoli: ${ea.message}`);
  const articoli = (art ?? []).map((a) => ({ ...a, prezzo_listino: Number(a.prezzo_listino), iva: a.iva === null ? null : Number(a.iva) })) as Articolo[];
  if (articoli.length < 30) throw new Error("Servono almeno 30 articoli attivi con prezzo di listino");

  for (const [i, codice] of clienti.entries()) {
    let { data: cli } = await db.from("clienti").select("id, demo").eq("codice_nts", codice).maybeSingle();
    if (cli && !cli.demo) {
      console.log(`${codice}: cliente reale (demo = false), salto. I documenti di prova vanno solo sui clienti demo.`);
      continue;
    }
    if (!cli) {
      if (cancella) continue;
      const { data: nuovo, error } = await db.from("clienti").insert({ codice_nts: codice, ragione_sociale: `Cliente ${codice} (accesso demo)`, demo: true }).select("id, demo").single();
      if (error) throw new Error(`${codice}: ${error.message}`);
      cli = nuovo;
    }
    const clienteId = Number(cli!.id);

    // Pulizia dei documenti di prova precedenti (le righe e il riepilogo IVA vanno via a cascata)
    const ds = await db.from("scadenze").delete().eq("cliente_id", clienteId).like("chiave_nts", `${PREFISSO}%`);
    if (ds.error) throw new Error(`${codice} scadenze: ${ds.error.message}`);
    const dd = await db.from("documenti").delete().eq("cliente_id", clienteId).like("chiave_nts", `${PREFISSO}%`);
    if (dd.error) throw new Error(`${codice} documenti: ${dd.error.message}`);
    if (cancella) {
      console.log(`${codice}: documenti di prova tolti`);
      continue;
    }

    const profilo = PAGAMENTI[i % PAGAMENTI.length];
    await db.from("clienti").update({ pagamento_codice: profilo.codice, pagamento_desc: profilo.desc }).eq("id", clienteId);

    const { data: ord } = await db
      .from("ordini")
      .select("id, riferimento_nts, righe_ordine(cod_dav, quantita, prezzo_finale)")
      .eq("cliente_id", clienteId)
      .not("riferimento_nts", "is", null)
      .in("stato", ["inviato", "confermato", "inserito_nts", "consegnato"])
      .order("creato_il", { ascending: false })
      .limit(1);
    type O = { riferimento_nts: string; righe_ordine: { cod_dav: string; quantita: string; prezzo_finale: string | null }[] };
    const o = (ord?.[0] as O | undefined) ?? null;
    const ordineShop = o ? { riferimento: o.riferimento_nts, righe: o.righe_ordine.map((r) => ({ cod_dav: r.cod_dav, quantita: Number(r.quantita), prezzo: r.prezzo_finale === null ? null : Number(r.prezzo_finale) })) } : null;

    const { documenti, scadenze } = genera(codice, articoli, profilo, ordineShop);
    const { data: ins, error: ei } = await db
      .from("documenti")
      .insert(
        documenti.map((d) => {
          const { _iva, ...extra } = d.extra;
          void _iva;
          return { chiave_nts: d.chiave_nts, cliente_id: clienteId, tipo: d.tipo, sottotipo: d.sottotipo, anno: d.anno, numero: d.numero, data_doc: d.data_doc, agente_desc: "UFFICIO", pagamento_codice: d.tipo === "ddt" ? null : profilo.codice, pagamento_desc: d.tipo === "ddt" ? null : profilo.desc, ...extra };
        }),
      )
      .select("id, chiave_nts");
    if (ei) throw new Error(`${codice} inserimento documenti: ${ei.message}`);
    const id = new Map((ins ?? []).map((r) => [r.chiave_nts as string, Number(r.id)]));

    const righe = documenti.flatMap((d) => d.righe.map((r) => ({ ...r, documento_id: id.get(d.chiave_nts) })));
    for (let k = 0; k < righe.length; k += 500) {
      const { error } = await db.from("righe_documento").insert(righe.slice(k, k + 500));
      if (error) throw new Error(`${codice} righe: ${error.message}`);
    }
    const iva = documenti
      .filter((d) => d.tipo !== "ddt")
      .flatMap((d) => (d.extra._iva as { aliquota: number; imponibile: number; imposta: number }[]).map((v) => ({ documento_id: id.get(d.chiave_nts), codice_iva: String(v.aliquota), aliquota: v.aliquota, descrizione: `IVA ${String(v.aliquota).padStart(2, "0")}%`, imponibile: v.imponibile, imposta: v.imposta })));
    if (iva.length) {
      const { error } = await db.from("riepilogo_iva").insert(iva);
      if (error) throw new Error(`${codice} riepilogo IVA: ${error.message}`);
    }
    if (scadenze.length) {
      const { error } = await db.from("scadenze").insert(
        scadenze.map((s) => ({ chiave_nts: s.chiave, cliente_id: clienteId, documento_id: id.get(s.documento), data_scadenza: s.data, importo: s.importo, residuo: s.residuo, stato: s.stato, tipo_pagamento: profilo.tipo })),
      );
      if (error) throw new Error(`${codice} scadenze: ${error.message}`);
    }
    const conta = (t: string) => documenti.filter((d) => d.tipo === t).length;
    console.log(`${codice}: ${conta("ddt")} DDT, ${conta("fattura")} fatture, ${conta("nota_credito")} note di credito, ${righe.length} righe, ${scadenze.length} scadenze · pagamento ${profilo.desc}${ordineShop ? ` · ultimo DDT collegato a ${ordineShop.riferimento}` : ""}`);
  }
}

// Avvio solo da riga di comando (lo script si può importare per i controlli).
if (/demo-documenti.ts$/.test(process.argv[1] ?? "")) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
