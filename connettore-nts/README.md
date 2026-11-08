# Connettore Shop DAV → NTS

Programma che gira su un computer della rete DAV e porta in NTS gli ordini confermati nello shop.
Ogni 30 secondi legge da Supabase gli ordini nuovi, li controlla e li scrive nelle tabelle di frontiera
`NTS_FRONTIERA` (testata, righe, semaforo). Il servizio NTS NtsFrontiera crea l'ordine cliente in pochi secondi.
Il connettore legge l'esito e aggiorna lo shop.

Il connettore fa solo connessioni **in uscita**: non serve aprire porte, SQL Server resta chiuso a internet.

```
Cliente conferma nello shop ──► ordine "da inviare" (Supabase) + email all'ufficio
Connettore (ogni 30 s)      ──► controlli ──► frontiera NTS ──► NTS crea l'ordine
                            ──► esito: "in NTS" con numero, oppure "errore" / "da verificare" + email all'ufficio
```

## Cosa serve

- Un computer **sempre acceso**, nella rete DAV, con internet in uscita (il server NTS, un PC d'ufficio sempre acceso o un mini PC).
- Windows 10/11 o Windows Server 2016 e successivi.
- **Node.js 22 LTS** o più recente: <https://nodejs.org> → "LTS" → installare con le opzioni predefinite.
- **NSSM** per farlo girare come servizio: <https://nssm.cc/download> → scompattare in `C:\nssm`.
- Nel database dello shop la **migrazione `supabase/migrations/0007_ordini_nts.sql`** già applicata
  (Supabase → SQL Editor → incollare il file → Run, poi registrarla in `_migrazioni`).
  Va applicata **prima** di pubblicare la versione dello shop che la usa.

## Installazione (una volta)

1. Copiare la cartella `connettore-nts` sul computer scelto, ad esempio in `C:\ShopDav\connettore-nts`.
   Basta questa cartella: il resto del sito non serve.
2. Aprire PowerShell **come amministratore** nella cartella e installare i pacchetti:
   ```powershell
   cd C:\ShopDav\connettore-nts
   npm ci
   npm run build
   ```
3. Creare il file di configurazione: copiare `.env.example` in `.env` e aprirlo con il Blocco note.
   ```powershell
   copy .env.example .env
   notepad .env
   ```
   Compilare:
   - `MSSQL_PASSWORD`: la password di `sa` (in prova) o di `shop_dav` (in produzione), presa dal gestore password;
   - `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`: dal pannello Supabase → Project Settings → API (chiave **secret**);
   - `RESEND_API_KEY`: la stessa dello shop, per le email di allarme;
   - lasciare `MODALITA=prova` e `CLIENTI_ABILITATI=` con il codice NTS del cliente di prova indicato nel brief.

   Il file `.env` contiene password: resta solo su questo computer, non va copiato altrove né mandato via email.
4. Controllare che tutto risponda (fa **solo letture**):
   ```powershell
   npm run controlla
   ```
   Deve finire con "Tutti i controlli superati". Mostra anche tipo, precisione e scala reali delle colonne
   di frontiera: il connettore le usa per non arrotondare mai prezzi o sconti in silenzio.
5. Un giro a mano, guardando cosa succede:
   ```powershell
   npm run una-volta
   ```
6. Installare il servizio (parte con Windows e riparte da solo se cade):
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\installa-servizio.ps1 -Nssm C:\nssm\win64\nssm.exe
   ```

## Uso quotidiano

- **Registro**: `logs\connettore.log` nella cartella del connettore. Una riga per evento.
- **Nel portale**: cruscotto ufficio → riquadro "Connettore NTS" (ultimo giro, modalità) e "Da controllare in NTS".
  Se il connettore non si fa sentire per più di 5 minuti il riquadro diventa rosso e parte un'email all'ufficio.
- **Ordine in errore o da verificare**: arriva un'email con il motivo. Nel dettaglio ordine del portale:
  - *Reinvia* (solo errori dei controlli, dopo aver corretto la causa);
  - *Segna inserito a mano* (dopo averlo inserito o trovato in NTS, con una nota);
  - *Copia riferimento* per cercarlo in NTS (`SHOP-000123`).
- **Fermare / riavviare** (PowerShell amministratore):
  ```powershell
  C:\nssm\win64\nssm.exe stop ShopDavConnettoreNts
  C:\nssm\win64\nssm.exe start ShopDavConnettoreNts
  ```
  Dopo ogni modifica al file `.env` il servizio va riavviato.

## Aggiornare il connettore

```powershell
C:\nssm\win64\nssm.exe stop ShopDavConnettoreNts
# sostituire i file della cartella con la nuova versione, tenendo .env e logs
npm ci
npm run build
C:\nssm\win64\nssm.exe start ShopDavConnettoreNts
```

## Disinstallare

```powershell
C:\nssm\win64\nssm.exe stop ShopDavConnettoreNts
C:\nssm\win64\nssm.exe remove ShopDavConnettoreNts confirm
```

## Piano di prova (brief, sezione 7)

Fermarsi dopo ogni punto e controllare il risultato prima di passare al successivo.

| # | Impostazioni / azione | Risultato atteso |
|---|---|---|
| 1 | `MODALITA=prova`, `CLIENTI_ABILITATI=<codice del cliente di prova>`. Ordine dallo shop come quel cliente: 2 righe, una nota di riga, nota d'ordine "PROVA SHOP - NON EVADERE". `npm run una-volta` | Nel registro dell'ordine "prova_ok". Niente in NTS. L'ordine resta "Da inviare". |
| 2 | `MODALITA=reale`, stesso ordine. `npm run una-volta` due volte a qualche secondo di distanza | "In NTS" con numero. In Business: prezzo, sconti, note e riferimento giusti. Poi cancellare l'ordine in Business. |
| 3 | Rimettere a mano lo stesso ordine "da_inviare" (SQL Editor: `update ordini set stato_nts = 'da_inviare' where riferimento_nts = 'SHOP-…'`). `npm run una-volta` | Registro "gia_in_frontiera": nessun secondo ordine in NTS. |
| 4 | Ordine con un articolo o un cliente che non esiste in NTS | "Errore" con email all'ufficio, niente scritto in frontiera. |
| 5 | `SIMULA_CRASH_DOPO_COMMIT=si`, nuovo ordine, `npm run una-volta` (esce dopo il COMMIT). Poi `SIMULA_CRASH_DOPO_COMMIT=no`, attendere 2 minuti, `npm run una-volta` | Il recupero trova il riferimento in frontiera: "In frontiera" / "In NTS", nessun secondo invio. |
| 6 | `MSSQL_SERVER` sbagliato (o rete staccata), servizio acceso per più di 5 minuti | L'ordine resta "Da inviare", heartbeat con SQL non raggiungibile, email di allarme dopo 5 minuti. Rimessa la configurazione giusta, l'ordine parte. |
| 7 | Solo dopo l'ok: `CLIENTI_ABILITATI=` vuota, riavviare il servizio | Passano gli ordini di tutti i clienti. |

Prima di togliere `CLIENTI_ABILITATI`: creare il login `shop_dav` con `sql\crea_utente_shop_dav.sql`,
metterlo nel `.env` al posto di `sa` e rilanciare `npm run controlla` (la lettura di `movord` deve risultare negata).

## Punti aperti

1. **Colonna di `testord` con il riferimento.** Dopo il punto 2 del piano di prova:
   `npm run cerca-riferimento -- SHOP-000123` (con il riferimento dell'ordine di prova) e mettere la colonna trovata in
   `TESTORD_COLONNA_RIFERIMENTO`. Serve a riconoscere gli ordini che NTS crea senza aggiornare la frontiera (circa il 15 %).
   Senza, quegli ordini finiscono "da verificare" e l'ufficio li controlla a mano.
2. **Data di consegna**: con `USA_DATA_CONS=si` va anche in `GPH_TESTATA_NTS.DATA_CONS`. Provarla su un ordine di prova
   e vedere dove compare in Business. In ogni caso resta scritta nelle note dell'ordine.
3. **Destinazioni diverse**: al lancio sempre 0 (fase 2).

## Regole che il connettore rispetta

- In `NTS_FRONTIERA` solo `SELECT` e `INSERT`; in `DAVNTS` solo letture su `anagra`, `artico`, `testord`. Mai `UPDATE` o `DELETE`.
- Non usa le tabelle `GPH2_*` né il servizio Graphite: le righe dei palmari degli agenti non vengono mai toccate.
- Manda sempre prezzo e sconti dello shop: mai `PREZZO = 0`. Un prezzo con più decimali di quelli accettati da NTS manda l'ordine in errore.
- Prima di ogni scrittura cerca il riferimento in frontiera: un ordine non entra mai due volte.
- Query sempre parametrizzate; password e chiavi solo nel `.env`; nel registro solo codice cliente e riferimento.

## Sviluppo

```bash
npm test        # regole e giro completo con SQL Server e Supabase finti
npm run tipi    # controllo dei tipi
```
