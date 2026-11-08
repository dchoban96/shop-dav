/**
 * Pulizia dei registri ruotati da NSSM in logs/.
 * NSSM ruota `connettore.log` ogni giorno (e a 10 MB) rinominandolo in
 * `connettore-AAAAMMGGThhmmss.mmm.log`, ma non cancella mai i vecchi file.
 * Qui si tengono gli ultimi GIORNI_LOG giorni; il file in uso non viene mai toccato.
 */
import { readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";

export const GIORNI_LOG = 30;

/** Solo i file ruotati da NSSM, mai `connettore.log` (in uso) né altri file. */
export const LOG_RUOTATO = /^connettore-\d{8}T\d{6}(\.\d{1,3})?\.log$/;

/** Cancella i registri ruotati più vecchi di `giorni`. Restituisce i nomi cancellati. */
export function pulisciLog(cartella: string, giorni = GIORNI_LOG, adesso = Date.now()): string[] {
  let nomi: string[];
  try {
    nomi = readdirSync(cartella);
  } catch {
    return []; // cartella logs non ancora creata (es. avvio a mano senza servizio)
  }
  const limite = adesso - giorni * 24 * 60 * 60 * 1000;
  const cancellati: string[] = [];
  for (const nome of nomi) {
    if (!LOG_RUOTATO.test(nome)) continue;
    const percorso = join(cartella, nome);
    try {
      if (statSync(percorso).mtimeMs < limite) {
        unlinkSync(percorso);
        cancellati.push(nome);
      }
    } catch {
      // file bloccato o già sparito: si riprova al prossimo giro di pulizia
    }
  }
  return cancellati;
}
