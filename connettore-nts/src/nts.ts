/**
 * Accesso a SQL Server NTS. Regole del brief (sezione 8):
 * - in NTS_FRONTIERA solo SELECT e INSERT su GPH_TESTATA_NTS, GPH_RIGA_NTS, GPH_SEMAFORO;
 * - in DAVNTS solo SELECT su anagra, artico, testord;
 * - niente UPDATE né DELETE, mai: le tabelle di frontiera le usano anche i palmari degli agenti;
 * - sempre query parametrizzate. Gli unici nomi inseriti nel testo SQL sono costanti di
 *   questo file o la colonna di testord verificata su sys.columns all'avvio.
 */
import sql from "mssql";
import { DITTA, type Config } from "./config.js";
import { chiaveArticolo, type ArticoloNts, type Colonna, type Colonne, type OrdinePreparato } from "./regole.js";

export type EsitoFrontiera = { id: number; stato: string; numero: number | null; logErrori: string };

/** Errore durante la scrittura: `commitInviato` dice se il COMMIT era già partito (esito incerto). */
export class ErroreScrittura extends Error {
  override name = "ErroreScrittura";
  constructor(
    public causa: unknown,
    public commitInviato: boolean,
  ) {
    super(causa instanceof Error ? causa.message : String(causa));
  }
}

const OBBLIGATORIE_TESTATA = [
  "ID", "DITTA", "TIPO_DOC", "ANNO", "SERIE", "NUMERO", "STATO_LAVORAZIONE", "DATA_DOC", "CONTO", "DESTINAZIONE", "DATA_INS",
  "AGENTE", "AGENTE2", "AGENTE3", "AGENTE4", "AGENTE5", "AGENTE6", "ACCONTO", "NOTE", "TIPO_SPED", "RIFERIMENTO", "LOG_ERRORI",
];
const OBBLIGATORIE_RIGA = ["ID_TESTATA", "NTS_RIGA", "CODICE_ART", "COLLI", "QUANTITA", "NOTE", "PREZZO", "SCONTO1", "SCONTO2", "UM", "DESCRIZIONE", "ID_KIT_ESTESO"];
const OBBLIGATORIE_SEMAFORO = ["AZIONE", "ID_ELABORAZIONE", "STATO", "TIPO_OGGETTO", "QUERY_OK_NTS", "QUERY_FAIL_NTS"];

/** Tipo mssql dalla colonna reale, così precisione, scala e lunghezze sono quelle di SQL Server. */
function tipoSql(c: Colonna | undefined): sql.ISqlType | (() => sql.ISqlType) | undefined {
  if (!c) return undefined;
  const lung = c.lunghezza < 0 ? sql.MAX : c.lunghezza;
  switch (c.tipo) {
    case "decimal":
    case "numeric":
      return sql.Decimal(c.precisione, c.scala);
    case "float":
      return sql.Float;
    case "real":
      return sql.Real;
    case "money":
      return sql.Money;
    case "int":
      return sql.Int;
    case "bigint":
      return sql.BigInt;
    case "smallint":
      return sql.SmallInt;
    case "tinyint":
      return sql.TinyInt;
    case "bit":
      return sql.Bit;
    case "varchar":
      return sql.VarChar(lung);
    case "nvarchar":
      return sql.NVarChar(lung);
    case "char":
      return sql.Char(c.lunghezza);
    case "nchar":
      return sql.NChar(c.lunghezza);
    case "datetime":
      return sql.DateTime;
    case "datetime2":
      return sql.DateTime2(c.scala);
    case "smalldatetime":
      return sql.SmallDateTime;
    case "date":
      return sql.Date;
    default:
      return undefined;
  }
}

export class Nts {
  private pool: sql.ConnectionPool | null = null;
  colTestata: Colonne = new Map();
  colRiga: Colonne = new Map();
  private colonnaRif: string | null = null;

  constructor(private cfg: Config) {}

  private configurazione(): sql.config {
    const m = this.cfg.mssql;
    return {
      server: m.server,
      port: m.porta,
      database: "NTS_FRONTIERA",
      user: m.utente,
      password: m.password,
      connectionTimeout: 15000,
      requestTimeout: 30000,
      pool: { max: 2, min: 0, idleTimeoutMillis: 60000 },
      options: {
        instanceName: m.istanza,
        encrypt: true,
        trustServerCertificate: m.trustServerCertificate,
        // Le date vanno scritte nell'ora locale di questa macchina (Italia), come fa NTS.
        useUTC: false,
        appName: "ShopDAV-Connettore",
      },
    };
  }

  /** Connette (o verifica la connessione) e legge le colonne reali delle tabelle di frontiera. */
  async connetti(): Promise<void> {
    if (this.pool?.connected) {
      await this.pool.request().query("SELECT 1 AS ok");
      return;
    }
    await this.chiudi();
    const pool = new sql.ConnectionPool(this.configurazione());
    pool.on("error", () => undefined);
    await pool.connect();
    this.pool = pool;
    this.colTestata = await this.colonne("GPH_TESTATA_NTS");
    this.colRiga = await this.colonne("GPH_RIGA_NTS");
    const colSem = await this.colonne("GPH_SEMAFORO");
    const manca = (cols: Colonne, nomi: string[], t: string) => nomi.filter((n) => !cols.has(n)).map((n) => `${t}.${n}`);
    const mancanti = [
      ...manca(this.colTestata, [...OBBLIGATORIE_TESTATA, ...(this.cfg.usaDataCons ? ["DATA_CONS"] : [])], "GPH_TESTATA_NTS"),
      ...manca(this.colRiga, OBBLIGATORIE_RIGA, "GPH_RIGA_NTS"),
      ...manca(colSem, OBBLIGATORIE_SEMAFORO, "GPH_SEMAFORO"),
    ];
    if (mancanti.length) throw new Error(`Colonne di frontiera mancanti o non leggibili: ${mancanti.join(", ")}`);
    this.colonnaRif = this.cfg.colonnaRiferimentoTestord ? await this.verificaColonnaTestord(this.cfg.colonnaRiferimentoTestord) : null;
  }

  async chiudi(): Promise<void> {
    const p = this.pool;
    this.pool = null;
    if (p) await p.close().catch(() => undefined);
  }

  private req(tx?: sql.Transaction): sql.Request {
    if (tx) return new sql.Request(tx);
    if (!this.pool) throw new Error("SQL Server non connesso");
    return this.pool.request();
  }

  /** Colonne di una tabella di NTS_FRONTIERA.dbo, con tipo, precisione, scala e lunghezza in caratteri. */
  async colonne(tabella: "GPH_TESTATA_NTS" | "GPH_RIGA_NTS" | "GPH_SEMAFORO"): Promise<Colonne> {
    const r = await this.req()
      .input("obj", sql.NVarChar(200), `dbo.${tabella}`)
      .query<{ nome: string; tipo: string; precisione: number; scala: number; max_length: number }>(
        `SELECT c.name AS nome, t.name AS tipo, c.precision AS precisione, c.scale AS scala, c.max_length
           FROM sys.columns c JOIN sys.types t ON t.user_type_id = c.user_type_id
          WHERE c.object_id = OBJECT_ID(@obj)`,
      );
    const m: Colonne = new Map();
    for (const c of r.recordset) {
      const tipo = c.tipo.toLowerCase();
      const lunghezza = c.max_length < 0 ? -1 : tipo === "nvarchar" || tipo === "nchar" ? c.max_length / 2 : c.max_length;
      m.set(c.nome.toUpperCase(), { nome: c.nome, tipo, precisione: c.precisione, scala: c.scala, lunghezza });
    }
    return m;
  }

  private async verificaColonnaTestord(nome: string): Promise<string> {
    const r = await this.req()
      .input("nome", sql.NVarChar(128), nome)
      .query<{ name: string }>(`SELECT name FROM DAVNTS.sys.columns WHERE object_id = OBJECT_ID('DAVNTS.dbo.testord') AND name = @nome`);
    if (!r.recordset.length) throw new Error(`TESTORD_COLONNA_RIFERIMENTO: la colonna "${nome}" non esiste in DAVNTS.dbo.testord`);
    return r.recordset[0].name;
  }

  /** Ultima testata di frontiera con questo riferimento (idempotenza e recupero dopo un crash). */
  async cercaRiferimento(rif: string): Promise<EsitoFrontiera | null> {
    const r = await this.req()
      .input("rif", tipoSql(this.colTestata.get("RIFERIMENTO")) ?? sql.NVarChar(50), rif)
      .query(`SELECT TOP 1 ID, STATO_LAVORAZIONE, NUMERO, LOG_ERRORI FROM dbo.GPH_TESTATA_NTS WHERE RIFERIMENTO = @rif ORDER BY ID DESC`);
    return r.recordset.length ? esito(r.recordset[0]) : null;
  }

  async esito(id: number): Promise<EsitoFrontiera | null> {
    const r = await this.req().input("id", sql.BigInt, id).query(`SELECT ID, STATO_LAVORAZIONE, NUMERO, LOG_ERRORI FROM dbo.GPH_TESTATA_NTS WHERE ID = @id`);
    return r.recordset.length ? esito(r.recordset[0]) : null;
  }

  async clienteEsiste(conto: number): Promise<boolean> {
    const r = await this.req()
      .input("ditta", sql.VarChar(12), DITTA)
      .input("conto", sql.Int, conto)
      .query(`SELECT COUNT(*) AS n FROM DAVNTS.dbo.anagra WHERE codditt = @ditta AND an_conto = @conto`);
    return Number(r.recordset[0].n) > 0;
  }

  /** Articoli da DAVNTS.dbo.artico: codice esatto, UM principale, blocco. Chiave = codice in maiuscolo. */
  async articoli(codici: string[]): Promise<Map<string, ArticoloNts>> {
    const m = new Map<string, ArticoloNts>();
    for (const cod of [...new Set(codici.map(chiaveArticolo))]) {
      const r = await this.req()
        .input("ditta", sql.VarChar(12), DITTA)
        .input("cod", sql.VarChar(50), cod)
        .query<{ ar_codart: string; ar_unmis: string | null; ar_blocco: string | null }>(
          `SELECT ar_codart, ar_unmis, ar_blocco FROM DAVNTS.dbo.artico WHERE codditt = @ditta AND ar_codart = @cod`,
        );
      const a = r.recordset[0];
      if (a) m.set(cod, { codice: String(a.ar_codart).trim(), um: String(a.ar_unmis ?? "").trim(), bloccato: String(a.ar_blocco ?? "").trim().toUpperCase() === "S" });
    }
    return m;
  }

  /** Controllo incrociato dopo 'C': l'ordine NTS con quel numero è di questo cliente. */
  async ordineInTestord(anno: number, numero: number, conto: number): Promise<boolean> {
    const r = await this.req()
      .input("ditta", sql.VarChar(12), DITTA)
      .input("anno", sql.Int, anno)
      .input("num", sql.Int, numero)
      .input("conto", sql.Int, conto)
      .query(`SELECT COUNT(*) AS n FROM DAVNTS.dbo.testord WHERE codditt = @ditta AND td_tipork = 'R' AND td_anno = @anno AND td_numord = @num AND td_conto = @conto`);
    return Number(r.recordset[0].n) > 0;
  }

  /** Ricerca per riferimento in testord (solo se TESTORD_COLONNA_RIFERIMENTO è impostata e verificata). */
  async testordPerRiferimento(anno: number, conto: number, rif: string): Promise<number | null> {
    if (!this.colonnaRif) return null;
    const col = `[${this.colonnaRif.replace(/]/g, "]]")}]`;
    const r = await this.req()
      .input("ditta", sql.VarChar(12), DITTA)
      .input("anno", sql.Int, anno)
      .input("conto", sql.Int, conto)
      .input("rif", sql.NVarChar(100), rif)
      .query<{ td_numord: number }>(
        `SELECT TOP 1 td_numord FROM DAVNTS.dbo.testord
          WHERE codditt = @ditta AND td_tipork = 'R' AND td_anno = @anno AND td_conto = @conto AND RTRIM(${col}) = @rif
          ORDER BY td_numord DESC`,
      );
    return r.recordset.length ? Number(r.recordset[0].td_numord) : null;
  }

  get haColonnaRiferimento(): boolean {
    return this.colonnaRif !== null;
  }

  /**
   * Ricetta del brief in un'unica transazione: testata, righe (con le note 'D'), semaforo.
   * In prova: tutto tranne il semaforo, poi ROLLBACK. Restituisce l'ID della testata.
   */
  async scrivi(o: OrdinePreparato, prova: boolean): Promise<{ id: number; righe: number }> {
    if (!this.pool) throw new Error("SQL Server non connesso");
    const T = (n: string) => tipoSql(this.colTestata.get(n));
    const R = (n: string) => tipoSql(this.colRiga.get(n));
    const tx = new sql.Transaction(this.pool);
    let commitInviato = false;
    await tx.begin();
    try {
      await this.req(tx).batch("SET XACT_ABORT ON");

      const colonneExtra = o.dataCons ? ", DATA_CONS" : "";
      const valoriExtra = o.dataCons ? ", @datacons" : "";
      const rt = this.req(tx)
        .input("ditta", T("DITTA") ?? sql.VarChar(12), DITTA)
        .input("anno", T("ANNO") ?? sql.Int, o.anno)
        .input("datadoc", T("DATA_DOC") ?? sql.DateTime, o.dataDoc)
        .input("conto", T("CONTO") ?? sql.Int, o.conto)
        .input("datains", T("DATA_INS") ?? sql.DateTime, new Date())
        .input("note", T("NOTE") ?? sql.NVarChar(sql.MAX), o.note)
        .input("rif", T("RIFERIMENTO") ?? sql.NVarChar(50), o.riferimento);
      if (o.dataCons) rt.input("datacons", T("DATA_CONS") ?? sql.DateTime, o.dataCons);
      const testata = await rt.query<{ id: string | number }>(
        `INSERT INTO dbo.GPH_TESTATA_NTS
           (DITTA, TIPO_DOC, ANNO, SERIE, NUMERO, STATO_LAVORAZIONE, DATA_DOC, CONTO, DESTINAZIONE, DATA_INS,
            AGENTE, AGENTE2, AGENTE3, AGENTE4, AGENTE5, AGENTE6, ACCONTO, NOTE, TIPO_SPED, RIFERIMENTO${colonneExtra})
         VALUES
           (@ditta, 'R', @anno, '', 0, 'N', @datadoc, @conto, 0, @datains,
            1, 0, 0, 0, 0, 0, 0, @note, '', @rif${valoriExtra});
         SELECT CAST(SCOPE_IDENTITY() AS bigint) AS id;`,
      );
      const id = Number(testata.recordset[0].id);
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error("SCOPE_IDENTITY non ha restituito l'ID della testata");

      for (const r of o.righe) {
        if (r.tipo === "articolo") {
          await this.req(tx)
            .input("id", sql.BigInt, id)
            .input("nr", R("NTS_RIGA") ?? sql.Int, r.nr)
            .input("cod", R("CODICE_ART") ?? sql.VarChar(50), r.codice)
            .input("qta", R("QUANTITA") ?? sql.Decimal(18, 6), r.quantita)
            .input("prezzo", R("PREZZO") ?? sql.Decimal(18, 6), r.prezzo)
            .input("sc1", R("SCONTO1") ?? sql.Decimal(9, 3), r.sconto1)
            .input("sc2", R("SCONTO2") ?? sql.Decimal(9, 3), r.sconto2)
            .input("um", R("UM") ?? sql.VarChar(10), r.um)
            .query(
              `INSERT INTO dbo.GPH_RIGA_NTS
                 (ID_TESTATA, NTS_RIGA, CODICE_ART, COLLI, QUANTITA, NOTE, PREZZO, SCONTO1, SCONTO2, UM, ID_KIT_ESTESO)
               VALUES (@id, @nr, @cod, 0, @qta, '', @prezzo, @sc1, @sc2, @um, 0)`,
            );
        } else {
          await this.req(tx)
            .input("id", sql.BigInt, id)
            .input("nr", R("NTS_RIGA") ?? sql.Int, r.nr)
            .input("testo", R("DESCRIZIONE") ?? sql.NVarChar(255), r.testo)
            .query(
              `INSERT INTO dbo.GPH_RIGA_NTS
                 (ID_TESTATA, NTS_RIGA, CODICE_ART, COLLI, QUANTITA, PREZZO, SCONTO1, SCONTO2, UM, DESCRIZIONE, ID_KIT_ESTESO)
               VALUES (@id, @nr, 'D', 0, 0, 0, 0, 0, '', @testo, 0)`,
            );
        }
      }

      if (prova) {
        // Prova a secco: tutto annullato, il semaforo non viene nemmeno scritto.
        await tx.rollback();
        return { id, righe: o.righe.length };
      }

      // Semaforo: il "campanello" che il servizio NTS controlla ogni secondo.
      await this.req(tx)
        .input("id", sql.BigInt, id)
        .query(
          `INSERT INTO dbo.GPH_SEMAFORO (AZIONE, ID_ELABORAZIONE, STATO, TIPO_OGGETTO, QUERY_OK_NTS, QUERY_FAIL_NTS)
           VALUES ('N', @id, 'N', 'D', 'SELECT 1', 'SELECT 1')`,
        );
      commitInviato = true;
      await tx.commit();
      return { id, righe: o.righe.length };
    } catch (e) {
      if (!commitInviato) await tx.rollback().catch(() => undefined);
      throw new ErroreScrittura(e, commitInviato);
    }
  }
}

function esito(r: Record<string, unknown>): EsitoFrontiera {
  const numero = r.NUMERO === null || r.NUMERO === undefined ? null : Number(r.NUMERO);
  return {
    id: Number(r.ID),
    stato: String(r.STATO_LAVORAZIONE ?? "").trim().toUpperCase(),
    numero: numero && numero > 0 ? numero : null,
    logErrori: String(r.LOG_ERRORI ?? "").trim(),
  };
}
