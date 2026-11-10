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
- Nel database dello shop le **migrazioni `0007_ordini_nts.sql` e `0008_avviso_connettore_nts.sql`** applicate
  (Supabase → SQL Editor → incollare il file → Run).
- Per l'email "connettore fermo" la chiave Resend nel **Vault di Supabase**, una volta sola, dal SQL Editor
  (scrivere la chiave solo lì, non salvare la query):
  ```sql
  select vault.create_secret('<chiave Resend re_...>', 'resend_api_key', 'Resend: avvisi connettore NTS');
  ```

## Installazione (una volta)

1. Copiare la cartella `connettore-nts` sul computer scelto, ad esempio in `C:\ShopDav\connettore-nts`.
   Basta questa cartella: il resto del sito non serve.
2. Aprire PowerShell **come amministratore** nella cartella e installare i pacchetti:
   ```powershell
   cd C:\ShopDav\connettore-nts
   npm ci
   npm run build
   ```
   `npm ci` installa le versioni esatte di `package-lock.json`. Se sulla macchina è impostato
   `NODE_ENV=production`, usare `npm ci --include=dev` (TypeScript serve per la build).
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
   di frontiera: il connettore le usa per arrotondare il prezzo al centesimo più vicino (annotato nel registro
   dell'ordine) e per non arrotondare mai quantità e sconti.
5. Un giro a mano, guardando cosa succede:
   ```powershell
   npm run una-volta
   ```
6. Installare il servizio (parte con Windows e riparte da solo se cade). Si può installare anche
   in `MODALITA=prova`: ogni ordine viene provato **una volta sola** (registro "prova_ok"), poi resta
   "Da inviare" ma il servizio non lo riprova a ogni giro; parte davvero solo passando a `MODALITA=reale`.
   Lo riprova soltanto se nel frattempo fallisce per un errore tecnico (rete, timeout) o viene recuperato dopo un crash.
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\installa-servizio.ps1 -Nssm C:\nssm\win64\nssm.exe
   ```

## Uso quotidiano

- **Registro**: `logs\connettore.log` nella cartella del connettore, una riga per evento. Ogni giorno il file del
  giorno prima diventa `logs\connettore-AAAA-MM-GG.log`; si tengono 30 giorni, i più vecchi si cancellano da soli.
  `logs\servizio.log` raccoglie solo quello che il programma scrive fuori dal registro (es. un crash all'avvio).
- **Nel portale**: cruscotto ufficio → riquadro "Connettore NTS" (ultimo segnale, modalità, ultimo avviso) e "Da controllare in NTS".
  Se il connettore non si fa sentire per più di 5 minuti il riquadro diventa rosso.
- **Email "connettore fermo"**: la manda un job programmato in Supabase (pg_cron, ogni minuto, migrazione 0008),
  quindi arriva anche se la macchina del connettore è spenta e nessuno apre il portale. Al massimo una all'ora
  per lo stesso silenzio. Per vedere lo stato a mano, nel SQL Editor: `select public.controlla_connettore_nts();`
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
| 2 | `MODALITA=reale`, stesso ordine. `npm run una-volta` due volte a qualche secondo di distanza, poi `npm run controlla` | "In NTS" con numero. In Business: prezzo, sconti, note e riferimento giusti. **Date**: in `controlla` → "Ultime testate dello shop" la `DATA_DOC` è il giorno dell'ordine e la `DATA_INS` è l'ora dell'invio come sull'orologio di Windows (stessa ora di "questa macchina" e di `GETDATE()`, non un'ora o due indietro), nello stesso formato delle testate dei palmari; il registro dell'ordine nel portale riporta la `DATA_INS` inviata. Poi cancellare l'ordine in Business. |
| 3 | Rimettere a mano lo stesso ordine "da_inviare" (SQL Editor: `update ordini set stato_nts = 'da_inviare' where riferimento_nts = 'SHOP-…'`). `npm run una-volta` | Registro "gia_in_frontiera": nessun secondo ordine in NTS. |
| 4 | Ordine con un articolo o un cliente che non esiste in NTS | "Errore" con email all'ufficio, niente scritto in frontiera. |
| 5 | `SIMULA_CRASH_DOPO_COMMIT=si`, nuovo ordine, `npm run una-volta` (esce dopo il COMMIT). Poi `SIMULA_CRASH_DOPO_COMMIT=no`, attendere 2 minuti, `npm run una-volta` | Il recupero trova il riferimento in frontiera: "In frontiera" / "In NTS", nessun secondo invio. |
| 6 | `MSSQL_SERVER` sbagliato (o rete staccata), servizio acceso per più di 5 minuti | L'ordine resta "Da inviare", heartbeat con SQL non raggiungibile, email di allarme dopo 5 minuti. Rimessa la configurazione giusta, l'ordine parte. Poi fermare il servizio per più di 5 minuti: arriva l'email "Connettore NTS fermo" mandata da Supabase e il cruscotto diventa rosso. |
| 7 | Solo dopo l'ok: `CLIENTI_ABILITATI=` vuota, riavviare il servizio | Passano gli ordini di tutti i clienti. |

Prima di togliere `CLIENTI_ABILITATI`: creare il login `shop_dav` con `sql\crea_utente_shop_dav.sql`,
metterlo nel `.env` al posto di `sa` e rilanciare `npm run controlla` (la lettura di `provvig`, le provvigioni, deve risultare negata).

## Ricognizione prezzi (una volta, prima dell'import di listino e sconti)

Comando di **sola lettura** su DAVNTS: legge la funzione prezzo di Graphite (`dbo.FNMG_GPH_PREZZO_LISTART2`),
le tabelle che usa, quelle con nomi da listini/sconti/prezzi e un caso di prova, e salva tutto in un file.
Serve per progettare l'import del listino 2 e degli sconti cliente. Non scrive niente in NTS né in Supabase.

1. Nel `.env` usare `sa` (serve il permesso di leggere le definizioni delle funzioni).
2. Lanciare con un cliente e un articolo di cui si conosce il prezzo in Business (es. quelli di un ordine bloccato):
   ```powershell
   npm run build
   npm run esplora-prezzi -- --cliente <codice conto NTS> --articolo <codice articolo>
   ```
   Opzioni: `--listino 2` (predefinito), `--funzione dbo.ALTRA_FUNZIONE`.
3. Il file finisce in `esplorazione\prezzi-AAAAMMGG-hhmmss.txt` (fuori dal repo). Mandarlo a chi sviluppa lo shop,
   con il prezzo che Business mostra per quel cliente e articolo (listino, sconti, netto).

Di anagra e artico il file riporta solo le colonne utili ai prezzi: niente indirizzi, partite IVA o contatti.

Seconda ricognizione, sugli sconti (anche questa solo letture): profilo di come sono usati `listini` e `sconti`
(per cliente, classe, listino, articolo, famiglia), decimali dei prezzi e, per il caso di prova, tutte le righe
di listino e sconto che possono valere più le ultime righe d'ordine NTS di quel cliente per quell'articolo.
```powershell
npm run esplora-sconti -- --cliente <codice conto NTS> --articolo <codice articolo>
```
Il file finisce in `esplorazione\sconti-AAAAMMGG-hhmmss.txt`.

## Ricognizione documenti e scadenze (una volta, per il brief "Documenti e pagamenti del cliente")

Comando di **sola lettura** su DAVNTS: colonne e conteggi di `testmag`/`movmag`, tabelle con nomi da scadenze, pagamenti,
IVA, lotti, trasporto, le query che Graphite e Business hanno eseguito davvero (cache dei piani di SQL Server),
l'anagrafica e i documenti dei clienti di prova, un DDT e una fattura campione con tutte le righe e le tabelle collegate.
Serve a individuare il mapping prima di costruire la sincronizzazione. Non scrive niente in NTS né in Supabase.

1. Aggiornare il connettore sul PC dell'ufficio (`git pull`, poi `npm ci` e `npm run build`). Nel `.env` usare `sa`.
2. Lanciare con i due clienti di prova e i due documenti delle stampe consegnate:
   ```powershell
   npm run esplora-documenti -- --clienti 140101656,140100402 --ddt 18931 --fattura 5113
   ```
   Opzioni: `--anno 2026` (anno dei documenti campione, predefinito: anno corrente), `--mesi 24` (periodo dei conteggi).
   Meglio lanciarlo **subito dopo** una ricezione dati di un palmare o una stampa di fattura da Business: le loro
   query sulle scadenze sono ancora nella cache del server e finiscono nella sezione 5 del file.
3. Il file finisce in `esplorazione\documenti-AAAAMMGG-hhmmss.txt` (fuori dal repo). Mandarlo a chi sviluppa lo shop
   insieme alle due stampe (cartella `esempi\` del repo, anch'essa fuori da git).

Nel file non compaiono mai colonne di costo, margine, provvigione, fido o note interne (filtro sul nome della colonna).
Compaiono invece anagrafica, documenti e partite dei due clienti di prova: il file resta in azienda.

## Import prezzi da NTS (listino, condizioni, storico)

Porta nello shop i prezzi che il cliente vede in NTS e sul palmare. Su NTS **solo letture**; senza `--scrivi`
**non tocca Supabase** e scrive solo il rapporto `esplorazione\import-prezzi-AAAAMMGG-hhmmss.txt`.

Regole (decise con l'ufficio il 10/11/2026), per ogni cliente e articolo vince la prima che vale:
1. **Storico** degli ultimi 300 giorni (ultima riga di ordini, DDT, fatture, come Graphite; le righe in omaggio
   non contano: sconto 100 %, per esempio "X+1" a Livigno, o riga di tipo omaggio "O", come l'omaggio con rivalsa):
   senza sconti e sotto il listino di oggi → **prezzo speciale** fisso (es. MOZGIU1 6,90 con listino 9,24);
   con sconti → **gli stessi sconti sul listino di oggi** (es. OLIGI5 2,28 −15 % → oggi 2,36 −15 % = 2,01);
   a prezzo pieno → si passa alla regola successiva.
2. **Prezzo netto personale** valido oggi in NTS (listini per cliente).
3. **Sconto cliente × articolo** valido oggi in NTS.
4. Altrimenti **listino del cliente** (anagrafica; 0 = listino 2) con gli sconti di listino, come la funzione Graphite.
In più gli sconti in anagrafica del cliente diventano uno sconto generale. Listino e prezzo netto sono al centesimo;
il terzo sconto e oltre si combinano nel secondo (se non sta in 2 decimali la condizione si scarta e il rapporto lo dice).
**Sconti oltre il 20 %** (complessivi, esclusi i prezzi speciali): nell'ordine inviato a NTS le note iniziano con
`CONTROLLARE SCONTISTICA: <articolo> -<sconto>%`, l'email all'ufficio lo ripete, la scheda cliente li segna
"da controllare" e il rapporto dell'import li elenca.

Prima volta:
1. Applicare in Supabase la migrazione `supabase/migrations/0010_prezzi_nts.sql` (SQL Editor → Run).
2. Prova e controllo del rapporto, anche su un cliente noto:
   ```powershell
   npm run build
   npm run importa-prezzi -- --cliente <conto> --articolo <codice>
   ```
   Nella sezione 4 del rapporto: listino, storico, scelta e prezzo finale (es. OLIGI5 2,01; MOZGIU1 6,90).
3. Scrittura:
   ```powershell
   npm run importa-prezzi -- --scrivi
   ```
4. Ogni notte, con l'Utilità di pianificazione di Windows (PowerShell amministratore, una volta):
   ```powershell
   schtasks /Create /TN "ShopDAV Import prezzi" /SC DAILY /ST 05:00 /RU SYSTEM /TR "cmd /c cd /d C:\ShopDav\shop-dav\connettore-nts && npm run importa-prezzi -- --scrivi >> logs\import-prezzi.log 2>&1"
   ```
   Durante la scrittura (pochi secondi) le condizioni vengono sostituite: per quell'istante vale il listino.

Con il login `shop_dav` servono anche le letture su `listini`, `sconti`, `movord`, `testmag`, `movmag`
(già nello script `sql\crea_utente_shop_dav.sql`).

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
- Manda sempre prezzo e sconti dello shop: mai `PREZZO = 0`. Il prezzo si arrotonda al centesimo più vicino se ha più decimali di quelli accettati dalla frontiera
  (il listino NTS ne ha fino a 3; decisione del 10/11/2026) e l'arrotondamento resta nel registro dell'ordine;
  quantità o sconti con troppi decimali mandano invece l'ordine in errore.
- Prima di ogni scrittura cerca il riferimento in frontiera: un ordine non entra mai due volte.
- Query sempre parametrizzate; password e chiavi solo nel `.env`; nel registro solo codice cliente e riferimento.

## Sviluppo

```bash
npm test        # regole e giro completo con SQL Server e Supabase finti
npm run tipi    # controllo dei tipi
```
