/**
 * Un giro del connettore (BRIEF_INTEGRAZIONE_NTS, sezione 5), in quest'ordine:
 *   1. recupero degli ordini rimasti 'in_invio' (crash a metà): mai reinviare senza cercare il riferimento;
 *   2. claim di fino a 5 ordini;
 *   3. controlli → 4. scrittura in frontiera (prova o reale);
 *   5. esito degli ordini in frontiera;
 *   6. email all'ufficio per 'errore' e 'da_verificare';
 *   7. ogni passaggio nel log (passa_stato_nts) e heartbeat per il cruscotto.
 * Le dipendenze (SQL Server, Supabase, email) arrivano dall'esterno: nei test sono finte.
 */
import { VERSIONE, type Config } from "./config.js";
import type { EsitoFrontiera } from "./nts.js";
import { dataOraLocale, ErroreScrittura } from "./nts.js";
import { messaggio, registro } from "./registro.js";
import { annoOrdine, clienteAbilitato, contoNts, ErroreOrdine, preparaOrdine, type ArticoloNts, type Colonne, type OrdinePreparato, type OrdineShop } from "./regole.js";
import type { OrdineInCorso, Passaggio, StatoNts } from "./shop.js";

export interface PortaNts {
  colTestata: Colonne;
  colRiga: Colonne;
  readonly haColonnaRiferimento: boolean;
  connetti(): Promise<void>;
  cercaRiferimento(rif: string): Promise<EsitoFrontiera | null>;
  esito(id: number): Promise<EsitoFrontiera | null>;
  clienteEsiste(conto: number): Promise<boolean>;
  articoli(codici: string[]): Promise<Map<string, ArticoloNts>>;
  ordineInTestord(anno: number, numero: number, conto: number): Promise<boolean>;
  testordPerRiferimento(anno: number, conto: number, rif: string): Promise<number | null>;
  scrivi(o: OrdinePreparato, prova: boolean): Promise<{ id: number; righe: number; dataIns: Date }>;
}

export interface PortaShop {
  claim(n: number, prova: boolean): Promise<OrdineShop[]>;
  passa(id: number, da: StatoNts[], a: StatoNts, p?: Passaggio): Promise<boolean>;
  log(ordineId: number, evento: string, dettaglio: string): Promise<void>;
  inInvioDaTroppo(minuti: number): Promise<OrdineInCorso[]>;
  inAttesaDiEsito(): Promise<OrdineInCorso[]>;
  righePerEmail(ordineId: number): Promise<{ cod_dav: string; descrizione: string; quantita: string | number; um: string | null; note: string | null }[]>;
  heartbeat(valore: Record<string, unknown>): Promise<void>;
}

export type Allarme = (oggetto: string, testo: string) => Promise<unknown>;

/** Tempi del brief. */
export const TEMPI = {
  recuperoMinuti: 2,
  attesaEsitoMinuti: 5,
  allarmeSqlMinuti: 5,
  ripetiAllarmeMinuti: 60,
  maxTentativi: 5,
  ordiniPerGiro: 5,
};

export class Connettore {
  private sqlGiuDal: number | null = null;
  private ultimoAllarmeSql = 0;
  /** Chiamata dopo il COMMIT quando SIMULA_CRASH_DOPO_COMMIT è attivo (piano di prova, punto 5). */
  crash: () => never = () => process.exit(3);

  constructor(
    private cfg: Config,
    private nts: PortaNts,
    private shop: PortaShop,
    private allarme: Allarme,
    private adesso: () => number = Date.now,
  ) {}

  /** Un giro completo. Non lancia eccezioni: gli errori finiscono nel registro e nell'heartbeat. */
  async giro(): Promise<{ sqlOk: boolean; errore: string | null }> {
    let sqlOk = false;
    let errore: string | null = null;
    try {
      await this.nts.connetti();
      sqlOk = true;
      this.sqlGiuDal = null;
    } catch (e) {
      errore = `SQL Server non raggiungibile: ${messaggio(e)}`;
      registro.errore(errore);
      await this.allarmeSqlGiu(errore);
    }

    if (sqlOk) {
      for (const [nome, fase] of [
        ["recupero", () => this.recupero()],
        ["invio", () => this.invio()],
        ["esiti", () => this.esiti()],
      ] as const) {
        try {
          await fase();
        } catch (e) {
          errore = `${nome}: ${messaggio(e)}`;
          registro.errore(errore);
        }
      }
    }

    try {
      await this.shop.heartbeat({
        ultimo_giro: new Date(this.adesso()).toISOString(),
        modalita: this.cfg.prova ? "prova" : "reale",
        sql_ok: sqlOk,
        ultimo_errore: errore,
        versione: VERSIONE,
        clienti_abilitati: this.cfg.clientiAbilitati.length ? this.cfg.clientiAbilitati.join(", ") : null,
      });
    } catch (e) {
      registro.errore("heartbeat non scritto (Supabase irraggiungibile?)", e);
    }
    return { sqlOk, errore };
  }

  private async allarmeSqlGiu(motivo: string): Promise<void> {
    const ora = this.adesso();
    this.sqlGiuDal ??= ora;
    const minuti = (ora - this.sqlGiuDal) / 60000;
    if (minuti < TEMPI.allarmeSqlMinuti || ora - this.ultimoAllarmeSql < TEMPI.ripetiAllarmeMinuti * 60000) return;
    this.ultimoAllarmeSql = ora;
    await this.allarme(
      "[Shop DAV] SQL Server NTS irraggiungibile dal connettore",
      `Il connettore non riesce a collegarsi a SQL Server NTS da ${Math.floor(minuti)} minuti.\n${motivo}\n\n` +
        "Gli ordini dello shop restano in coda e partono appena SQL Server torna raggiungibile.\n" +
        "Se serve evaderli prima, inserirli a mano in NTS e segnarli 'inserito a mano' nel portale.",
    );
  }

  // 1. Recupero ------------------------------------------------------------------------
  async recupero(): Promise<void> {
    for (const o of await this.shop.inInvioDaTroppo(TEMPI.recuperoMinuti)) {
      const e = await this.nts.cercaRiferimento(o.riferimento_nts);
      if (e) {
        await this.shop.passa(o.id, ["in_invio"], "in_frontiera", {
          idFrontiera: e.id,
          evento: "recupero",
          dettaglio: `Rimasto in invio: il riferimento è già in frontiera (ID ${e.id}), non lo riscrivo`,
        });
        registro.info(`${o.riferimento_nts}: recuperato, già in frontiera con ID ${e.id}`);
      } else {
        await this.shop.passa(o.id, ["in_invio"], "da_inviare", { evento: "recupero", dettaglio: "Rimasto in invio e non presente in frontiera: torna in coda" });
        registro.info(`${o.riferimento_nts}: recuperato, non era in frontiera → torna in coda`);
      }
    }
  }

  // 2-4. Claim, controlli, scrittura ---------------------------------------------------
  async invio(): Promise<void> {
    const ordini = await this.shop.claim(TEMPI.ordiniPerGiro, this.cfg.prova);
    for (const o of ordini) await this.inviaUno(o);
  }

  async inviaUno(o: OrdineShop): Promise<void> {
    const rif = o.riferimento_nts ?? `ordine ${o.numero}`;
    try {
      if (!clienteAbilitato(o.cliente.codice_nts, this.cfg.clientiAbilitati)) {
        throw new ErroreOrdine(
          `Cliente ${o.cliente.codice_nts} non abilitato all'invio automatico (CLIENTI_ABILITATI, fase di prova): inserire l'ordine a mano in NTS e segnarlo "inserito a mano"`,
        );
      }

      // Idempotenza: se il riferimento è già in frontiera non si riscrive, si segue quell'ID.
      const esistente = await this.nts.cercaRiferimento(rif);
      if (esistente) {
        await this.shop.passa(o.id, ["in_invio"], "in_frontiera", {
          idFrontiera: esistente.id,
          evento: "gia_in_frontiera",
          dettaglio: `Riferimento già presente in frontiera (ID ${esistente.id}): non lo riscrivo`,
        });
        registro.info(`${rif}: già in frontiera con ID ${esistente.id}, non lo riscrivo`);
        return;
      }

      const conto = contoNts(o.cliente.codice_nts);
      if (!(await this.nts.clienteEsiste(conto))) throw new ErroreOrdine(`Cliente ${conto} non trovato nell'anagrafica NTS`);
      const articoli = await this.nts.articoli(o.righe.map((r) => r.cod_dav));
      const prep = preparaOrdine(o, { colTestata: this.nts.colTestata, colRiga: this.nts.colRiga, articoli, usaDataCons: this.cfg.usaDataCons });

      const scritto = await this.nts.scrivi(prep, this.cfg.prova);
      for (const a of prep.avvisi) await this.shop.log(o.id, "avviso", a);

      if (this.cfg.prova) {
        await this.shop.passa(o.id, ["in_invio"], "da_inviare", {
          evento: "prova_ok",
          dettaglio: `Prova a secco OK: testata e ${scritto.righe} righe scritte in frontiera e annullate (niente in NTS)`,
          provaOk: true,
        });
        registro.info(`${rif}: prova a secco OK (${scritto.righe} righe)`);
        return;
      }

      if (this.cfg.simulaCrashDopoCommit) {
        registro.avviso(`${rif}: COMMIT fatto (ID ${scritto.id}), SIMULA_CRASH_DOPO_COMMIT → esco senza aggiornare lo shop`);
        return this.crash();
      }

      await this.shop.passa(o.id, ["in_invio"], "in_frontiera", {
        idFrontiera: scritto.id,
        evento: "in_frontiera",
        dettaglio: `Scritto in frontiera: ID ${scritto.id}, ${scritto.righe} righe, DATA_DOC ${dataOraLocale(prep.dataDoc).slice(0, 10)}, DATA_INS ${dataOraLocale(scritto.dataIns)} (ora locale)`,
      });
      registro.info(`${rif}: scritto in frontiera, ID ${scritto.id}, DATA_INS ${dataOraLocale(scritto.dataIns)}`);
    } catch (e) {
      await this.gestisciErroreInvio(o, rif, e);
    }
  }

  private async gestisciErroreInvio(o: OrdineShop, rif: string, e: unknown): Promise<void> {
    if (e instanceof ErroreOrdine) {
      registro.avviso(`${rif}: ${e.message}`);
      if (await this.shop.passa(o.id, ["in_invio"], "errore", { errore: e.message, evento: "errore" })) {
        await this.emailOrdine("errore", o.id, rif, o.cliente, e.message);
      }
      return;
    }
    if (e instanceof ErroreScrittura && e.commitInviato) {
      // COMMIT partito ma esito sconosciuto: resta 'in_invio', il recupero cerca il riferimento.
      registro.errore(`${rif}: esito del COMMIT incerto, lo verifica il recupero`, e.causa);
      await this.shop.log(o.id, "commit_incerto", `Esito del COMMIT incerto (${messaggio(e.causa)}): lo verifica il recupero`).catch(() => undefined);
      return;
    }
    // Errore tecnico prima del COMMIT (rete, timeout...): niente è rimasto in frontiera, si riprova.
    const msg = messaggio(e instanceof ErroreScrittura ? e.causa : e);
    if (o.tentativi_nts >= TEMPI.maxTentativi) {
      const testo = `Invio non riuscito dopo ${o.tentativi_nts} tentativi: ${msg}`;
      registro.errore(`${rif}: ${testo}`);
      if (await this.shop.passa(o.id, ["in_invio"], "errore", { errore: testo, evento: "errore" })) {
        await this.emailOrdine("errore", o.id, rif, o.cliente, testo);
      }
      return;
    }
    registro.avviso(`${rif}: tentativo ${o.tentativi_nts} non riuscito (${msg}), riprovo al prossimo giro`);
    await this.shop.passa(o.id, ["in_invio"], "da_inviare", { evento: "riprovo", dettaglio: `Tentativo ${o.tentativi_nts} non riuscito: ${msg}` });
  }

  // 5. Esito ------------------------------------------------------------------------------
  async esiti(): Promise<void> {
    for (const o of await this.shop.inAttesaDiEsito()) {
      try {
        await this.esitoUno(o);
      } catch (e) {
        registro.errore(`${o.riferimento_nts}: lettura esito`, e);
      }
    }
  }

  async esitoUno(o: OrdineInCorso): Promise<void> {
    const rif = o.riferimento_nts;
    const daVerificare = o.stato_nts === "da_verificare";
    const conto = contoNts(o.cliente.codice_nts);
    const anno = annoOrdine(o.creato_il);
    const e = o.id_frontiera ? await this.nts.esito(o.id_frontiera) : null;

    if (!e) {
      if (!daVerificare) await this.verso("da_verificare", o, `Testata ${o.id_frontiera} non trovata in frontiera`);
      return;
    }
    if (e.logErrori) {
      await this.verso("errore", o, `NTS ha scartato l'ordine: ${e.logErrori}`);
      return;
    }
    if (e.stato === "C" && e.numero) {
      if (await this.nts.ordineInTestord(anno, e.numero, conto)) {
        await this.shop.passa(o.id, ["in_frontiera", "da_verificare"], "in_nts", {
          numeroNts: e.numero,
          evento: "in_nts",
          dettaglio: `Ordine NTS n. ${e.numero}/${anno} creato e verificato in testord`,
        });
        registro.info(`${rif}: in NTS con numero ${e.numero}`);
      } else if (!daVerificare) {
        await this.verso("da_verificare", o, `NTS segna l'ordine come elaborato (n. ${e.numero}) ma in testord non c'è un ordine ${e.numero}/${anno} del cliente ${conto}`, e.numero);
      }
      return;
    }

    // Ancora da elaborare (N o L). Dopo 5 minuti si cerca in testord per riferimento.
    const da = o.in_frontiera_il ? new Date(o.in_frontiera_il).getTime() : this.adesso();
    if (this.adesso() - da < TEMPI.attesaEsitoMinuti * 60000) return;
    const numero = await this.nts.testordPerRiferimento(anno, conto, rif);
    if (numero) {
      await this.shop.passa(o.id, ["in_frontiera", "da_verificare"], "in_nts", {
        numeroNts: numero,
        evento: "in_nts",
        dettaglio: `Frontiera ancora in stato ${e.stato || "?"}, ma l'ordine è in testord con il riferimento: n. ${numero}/${anno}`,
      });
      registro.info(`${rif}: trovato in testord per riferimento, numero ${numero}`);
    } else if (!daVerificare) {
      await this.verso(
        "da_verificare",
        o,
        `Dopo ${TEMPI.attesaEsitoMinuti} minuti NTS non ha ancora elaborato l'ordine (stato ${e.stato || "?"})` +
          (this.nts.haColonnaRiferimento ? " e non lo trovo in testord per riferimento" : "") +
          ". Spesso l'ordine è comunque in NTS: cercarlo per riferimento",
      );
    }
  }

  private async verso(a: "errore" | "da_verificare", o: OrdineInCorso, motivo: string, numeroNts?: number): Promise<void> {
    registro.avviso(`${o.riferimento_nts}: ${a} - ${motivo}`);
    if (await this.shop.passa(o.id, ["in_frontiera", "da_verificare"], a, { errore: motivo, evento: a, numeroNts })) {
      await this.emailOrdine(a, o.id, o.riferimento_nts, o.cliente, motivo);
    }
  }

  // 6. Email all'ufficio ------------------------------------------------------------------
  private async emailOrdine(tipo: "errore" | "da_verificare", ordineId: number, rif: string, cliente: { codice_nts: string; ragione_sociale: string }, motivo: string): Promise<void> {
    try {
      const righe = await this.shop.righePerEmail(ordineId);
      const elenco = righe.map((r) => `  ${r.cod_dav}  ${r.descrizione}  x${Number(r.quantita)} ${r.um ?? ""}${r.note ? `  [${r.note}]` : ""}`).join("\n");
      const link = this.cfg.appUrl ? `\nApri l'ordine: ${this.cfg.appUrl}/admin/ordini/${ordineId}\n` : "";
      await this.allarme(
        `[${rif}] Ordine shop ${tipo === "errore" ? "in ERRORE" : "DA VERIFICARE"} – ${cliente.ragione_sociale}`,
        `Ordine ${rif} del cliente ${cliente.codice_nts} ${cliente.ragione_sociale}\n` +
          `Stato: ${tipo === "errore" ? "errore" : "da verificare"}\nMotivo: ${motivo}\n\nRighe:\n${elenco || "  (non lette)"}\n${link}\n` +
          "Verificare in NTS prima di inserirlo a mano (cercare il riferimento " + rif + ").\n" +
          "Dopo l'inserimento a mano, segnarlo \"inserito a mano\" nel portale.",
      );
    } catch (e) {
      registro.errore(`${rif}: email all'ufficio`, e);
    }
  }
}
