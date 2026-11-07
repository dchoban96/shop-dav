import type { Metadata } from "next";
import Link from "next/link";
import { Bottone } from "@/components/Bottone";
import { azienda } from "@/lib/azienda";

export const metadata: Metadata = { title: "Area clienti" };

/**
 * Pagina di accesso: per ora solo interfaccia. L’autenticazione (Supabase Auth con
 * invito via email) arriva nel passo 3 dell’ordine di costruzione.
 */
export default function Accedi() {
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <p className="etichetta">Area clienti</p>
      <h1 className="mt-2 text-3xl">Accedi</h1>
      <p className="mt-3 text-sm text-slate">
        L’accesso è riservato ai clienti DAV e si ottiene su invito dell’ufficio.
      </p>

      <form className="mt-8 space-y-5" action="#" method="post">
        <div>
          <label htmlFor="email" className="etichetta block">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="mt-2 w-full rounded-md border border-azzurro bg-bianco px-4 py-3 text-base"
          />
        </div>
        <div>
          <label htmlFor="password" className="etichetta block">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="mt-2 w-full rounded-md border border-azzurro bg-bianco px-4 py-3 text-base"
          />
        </div>
        <Bottone type="submit" className="w-full" disabled>
          Entra
        </Bottone>
        <p className="text-sm">
          <Link href="/recupera" className="underline underline-offset-2">
            Password dimenticata?
          </Link>
        </p>
      </form>

      <div className="mt-10 rounded-lg bg-ice p-5 text-sm text-slate">
        Sei cliente DAV e non hai ancora l’accesso? Scrivi a{" "}
        <a href={`mailto:${azienda.email}`} className="underline underline-offset-2">
          {azienda.email}
        </a>{" "}
        o chiedi al tuo referente.
      </div>
    </div>
  );
}
