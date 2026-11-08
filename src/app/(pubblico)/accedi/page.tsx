import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Bottone } from "@/components/Bottone";
import { azienda } from "@/lib/azienda";
import { accedi } from "./azioni";
import { Contenitore } from "@/components/Contenitore";

export const metadata: Metadata = { title: "Area clienti" };

type Props = { searchParams: Promise<{ errore?: string }> };

async function MessaggioErrore({ searchParams }: Props) {
  const { errore } = await searchParams;
  if (!errore) return null;
  return (
    <p role="alert" className="rounded-md border border-navy bg-ice px-4 py-3 text-sm">
      Codice cliente o password non validi. Per ora la password è il tuo codice cliente.
    </p>
  );
}

/**
 * Accesso provvisorio (demo): codice cliente come login e come password.
 * L'accesso con email e invito arriva con Supabase Auth (passo 3 della struttura).
 */
export default function Accedi({ searchParams }: Props) {
  return (
    <Contenitore className="py-16">
      <div className="mx-auto max-w-md">
      <p className="etichetta">Area clienti</p>
      <h1 className="mt-2 text-3xl">Accedi</h1>
      <p className="mt-3 text-sm text-slate">
        L’accesso è riservato ai clienti DAV e si ottiene su invito dell’ufficio.
      </p>

      <form className="mt-8 space-y-5" action={accedi}>
        <Suspense fallback={null}>
          <MessaggioErrore searchParams={searchParams} />
        </Suspense>
        <div>
          <label htmlFor="codice" className="etichetta block">
            Codice cliente
          </label>
          <input
            id="codice"
            name="codice"
            type="text"
            inputMode="text"
            autoComplete="username"
            autoCapitalize="characters"
            required
            maxLength={12}
            className="mt-2 w-full rounded-md border border-azzurro bg-bianco px-4 py-3 text-base uppercase"
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
        <Bottone type="submit" className="w-full">
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
    </Contenitore>
  );
}
