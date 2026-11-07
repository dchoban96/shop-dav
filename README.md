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

## Accesso demo (provvisorio)

Finché non c'è Supabase Auth con invito via email, l'area clienti si apre con il **codice
cliente usato sia come login sia come password**. In sviluppo va bene qualsiasi codice di 3–12
caratteri (es. `DEMO1` / `DEMO1`); in produzione solo i codici elencati in `DEMO_CODICI_CLIENTE`.
La sessione è un cookie firmato con `AUTH_SECRET` (vedi `src/lib/sessione.ts`).

## Struttura

```
src/app/(pubblico)/   landing, chi-siamo, partner, policy, accedi (+ azioni.ts), recupera
src/app/(cliente)/    area riservata: layout con controllo sessione, home
src/components/       Header, HeaderCliente, Footer, Logo, Bottone, Sezione
src/lib/azienda.ts    dati aziendali mostrati nel sito pubblico
src/lib/sessione.ts   cookie di sessione firmato, validazione codici demo
src/app/globals.css   colori e font del brand (Tailwind @theme)
public/brand/         loghi ufficiali SVG dalle brand guidelines
```

## Brand

Colori: navy `#122C5A` (primario), azzurro `#90B1CA` (accento), bianco, ice `#EEF3F7`, slate `#51627A`.
Font: Libre Baskerville per titoli e prezzi, Libre Franklin per testo e interfaccia (Google Fonts).
I loghi in `public/brand/` sono i file ufficiali delle brand guidelines: orizzontale per l'header,
emblema piccolo per favicon e header mobile, versioni reversed e bianca per fondi scuri. Non vanno
ridisegnati né ricolorati.

## Dati

Nessun dato cliente, listino o export gestionale va nel repository. Le cartelle `dati/`, i file
`.xlsx`/`.csv` e le foto fornitori sono esclusi da git. Le chiavi stanno solo in `.env.local`.
