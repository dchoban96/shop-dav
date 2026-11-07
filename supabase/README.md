# Database Supabase

Migrazioni SQL in `migrations/`, in ordine:

1. `0001_schema.sql` — tabelle (STRUTTURA, sezione 2)
2. `0002_rls.sql` — Row Level Security: funzioni `cliente_corrente()` e `is_admin()`, policy per tabella
3. `0003_funzioni.sql` — `descrizione_pulita`, `disponibilita`, `prezzo_cliente`, trigger `aggiornato_il`

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

- Sconti in percentuale (10 = 10 %). Prezzi senza IVA, 4 decimali.
- `giorni_consegna`: 1 = lunedì … 6 = sabato.
- Il service role bypassa RLS: solo per import e job lato server.
