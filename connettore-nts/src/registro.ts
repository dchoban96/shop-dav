/**
 * Registro del connettore. Una riga per evento, con data e ora locali.
 * Niente password e niente dati personali oltre a codice cliente e riferimento.
 *
 * File: logs\connettore.log, ruotato ogni giorno. Al primo evento di un nuovo giorno il file
 * del giorno prima diventa logs\connettore-AAAA-MM-GG.log; si tengono 30 giorni, i più vecchi
 * vengono cancellati. Come servizio (CONNETTORE_SERVIZIO=1) scrive solo nel file; lanciato a mano
 * scrive anche a video.
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const due = (n: number) => String(n).padStart(2, "0");
const giorno = (d: Date) => `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}`;
const ora = (d: Date) => `${giorno(d)} ${due(d.getHours())}:${due(d.getMinutes())}:${due(d.getSeconds())}`;

const NOME = "connettore.log";
const ARCHIVIO = /^connettore-(\d{4}-\d{2}-\d{2})(?:-\d+)?\.log$/;

/** File di registro con rotazione giornaliera e conservazione limitata. */
export class FileRegistro {
  private giornoFile: string;

  constructor(
    readonly cartella: string,
    private giorniConservati = 30,
    private adesso: () => Date = () => new Date(),
  ) {
    mkdirSync(cartella, { recursive: true });
    // Un connettore.log rimasto da un giorno precedente (servizio fermo a mezzanotte) va archiviato col suo giorno.
    this.giornoFile = existsSync(this.file) ? giorno(statSync(this.file).mtime) : giorno(this.adesso());
    this.ruotaSeServe();
    this.pulisci();
  }

  get file(): string {
    return join(this.cartella, NOME);
  }

  scrivi(riga: string): void {
    this.ruotaSeServe();
    appendFileSync(this.file, riga + "\r\n", "utf8");
  }

  private ruotaSeServe(): void {
    const oggi = giorno(this.adesso());
    if (oggi === this.giornoFile) return;
    if (existsSync(this.file)) {
      let dest = join(this.cartella, `connettore-${this.giornoFile}.log`);
      for (let i = 2; existsSync(dest); i++) dest = join(this.cartella, `connettore-${this.giornoFile}-${i}.log`);
      renameSync(this.file, dest);
    }
    this.giornoFile = oggi;
    this.pulisci();
  }

  /** Cancella gli archivi più vecchi di `giorniConservati` giorni (il file di oggi non conta). */
  pulisci(): void {
    const d = this.adesso();
    const limite = giorno(new Date(d.getFullYear(), d.getMonth(), d.getDate() - this.giorniConservati));
    for (const f of readdirSync(this.cartella)) {
      const m = ARCHIVIO.exec(f);
      if (m && m[1] < limite) {
        try {
          unlinkSync(join(this.cartella, f));
        } catch {
          // file in uso o già cancellato: ci si riprova alla prossima rotazione
        }
      }
    }
  }
}

let fileRegistro: FileRegistro | null = null;
let aVideo = true;

/** Attiva il file di registro. `soloFile` = niente output a video (servizio Windows). */
export function attivaFileRegistro(cartella: string, opzioni: { giorni?: number; soloFile?: boolean } = {}): FileRegistro {
  fileRegistro = new FileRegistro(cartella, opzioni.giorni ?? 30);
  aVideo = !opzioni.soloFile;
  return fileRegistro;
}

function scrivi(livello: "INFO " | "AVVISO" | "ERRORE", msg: string): void {
  const riga = `${ora(new Date())} ${livello} ${msg}`;
  if (aVideo) (livello === "ERRORE" ? console.error : livello === "AVVISO" ? console.warn : console.log)(riga);
  if (fileRegistro) {
    try {
      fileRegistro.scrivi(riga);
    } catch (e) {
      console.error(`${riga}\n(registro su file non scritto: ${messaggio(e)})`);
    }
  }
}

export const registro = {
  info: (msg: string) => scrivi("INFO ", msg),
  avviso: (msg: string) => scrivi("AVVISO", msg),
  errore: (msg: string, e?: unknown) => scrivi("ERRORE", `${msg}${e ? `: ${messaggio(e)}` : ""}`),
};

export function messaggio(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}
