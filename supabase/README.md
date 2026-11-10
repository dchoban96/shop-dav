# Database Supabase

Migrazioni SQL in `migrations/`, in ordine:

1. `0001_schema.sql` — tabelle (STRUTTURA, sezione 2)
2. `0002_rls.sql` — Row Level Security: funzioni `cliente_corrente()` e `is_admin()`, policy per tabella
3. `0003_funzioni.sql` — `descrizione_pulita`, `disponibilita`, `prezzo_cliente`, trigger `aggiornato_il`
4. `0004_viste_catalogo.sql` — viste `v_marchi_catalogo`, `v_famiglie_catalogo`
5. `0005_ordini.sql` — carrello, `conferma_ordine`
6. `0006_prezzi_cliente.sql` — `prezzi_cliente` (prezzi di una lista di articoli in un colpo solo)
7. `0007_ordini_nts.sql` — invio automatico a NTS: colonne `stato_nts`/`riferimento_nts`… su `ordini`,
   tabella `log_nts`, riferimento `SHOP-000123` assegnato alla conferma, `claim_ordini_nts` e
   `passa_stato_nts` (solo service role, usate dal connettore in `connettore-nts/`).
   Va applicata **prima** di pubblicare lo shop che la usa.
8. `0008_avviso_connettore_nts.sql` — job pg_cron ogni minuto (`controlla_connettore_nts`): se il connettore
   NTS tace da 5 minuti manda l'email all'ufficio via pg_net → Resend, con la chiave `resend_api_key` del Vault.
   Il trigger su `impostazioni` mette `ricevuto_il` (ora del database) nell'heartbeat.
9. `0009_documenti.sql` — documenti del cliente da NTS: `documenti` (DDT, fatture, note di credito),
   `righe_documento`, `riepilogo_iva`, `scadenze`, `invii_documenti`, `sync_stato`; `clienti.pagamento_codice`
   e `pagamento_desc`. Le scrive solo il connettore (service role); il cliente legge i propri documenti ancora in NTS.
   Una riga di DDT con `rif_ordine_shop = 'SHOP-…'` porta l'ordine dello shop a "consegnato".
   Lo shop funziona anche prima di questa migrazione: DDT, fatture e pagamenti mostrano "in arrivo".
   Dati di prova per i clienti demo: `npm run demo-documenti` (toglierli: `-- --cancella`).

10. `0010_prezzi_nts.sql` — prezzi da NTS: tabella `listini_nts` (listino per articolo e numero, al centesimo, con
    sconti di listino), `clienti.listino_nts`, `condizioni_cliente.origine` e `rif_storico`; `prezzo_cliente` usa il
    listino del cliente e arrotonda il prezzo finale al centesimo. I dati li scrive il connettore (`importa-prezzi`).

11. `0011_sconti_oltre_soglia.sql` — se il cliente non ha un prezzo speciale e la sua condizione dà uno sconto
    complessivo oltre il 20 %, `prezzo_cliente` restituisce il listino (origine `sconto_da_verificare`): lo shop
    mostra "scontistica non disponibile, chiedi info all'agente o all'ufficio DAV".

## Applicarle

Con la CLI Supabase collegata al progetto:

```bash
npx supabase link --project-ref <ref>
npx supabase db push
```

Oppure dal pannello Supabase, SQL Editor, incollando i tre file nell'ordine.

## Verifica locale senza Supabase

```bash
npm run test:db
```

Applica le migrazioni su un Postgres in memoria (PGlite) con uno stub dello schema `auth`
e controlla descrizione pulita, disponibilità, precedenza dei prezzi e le policy RLS.

## Convenzioni

- Sconti in percentuale (10 = 10 %). Prezzi senza IVA; listini da NTS e prezzo finale al centesimo (0010).
- `giorni_consegna`: 1 = lunedì … 6 = sabato.
- Il service role bypassa RLS: solo per import e job lato server.
