# Shop B2B DAV

Portale riservato ai clienti di D.A.V. snc (Distribuzione Alimentare Valtellinese, Caiolo SO):
sito pubblico, accesso su invito, riordino rapido, catalogo, prezzi per cliente, ordini via email.

Stack: Next.js (App Router) + Tailwind CSS 4, Supabase (Postgres, Auth, Storage), Resend per le email.

## Avvio

```bash
npm install
cp .env.example .env.local   # compilare le chiavi
npm run dev
```

Il sito risponde su http://localhost:3000.

## Struttura

```
src/app/(pubblico)/   landing, chi-siamo, partner, policy, accedi, recupera
src/components/       Header, Footer, Logo, Bottone, Sezione
src/lib/azienda.ts    dati aziendali mostrati nel sito pubblico
src/app/globals.css   colori e font del brand (Tailwind @theme)
```

## Brand

Colori: navy `#122C5A` (primario), azzurro `#90B1CA` (accento), bianco, ice `#EEF3F7`, slate `#51627A`.
Font: Libre Baskerville per titoli e prezzi, Libre Franklin per testo e interfaccia (Google Fonts).
Il logo in `src/components/Logo.tsx` è un segnaposto fino all'arrivo dei file ufficiali in `public/brand/`.

## Dati

Nessun dato cliente, listino o export gestionale va nel repository. Le cartelle `dati/`, i file
`.xlsx`/`.csv` e le foto fornitori sono esclusi da git. Le chiavi stanno solo in `.env.local`.
