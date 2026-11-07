import type { Metadata } from "next";
import { Suspense } from "react";
import { Bottone } from "@/components/Bottone";
import { Logo } from "@/components/Logo";
import { adminConfigurato } from "@/lib/sessione";
import { accediAdmin } from "./azioni";

export const metadata: Metadata = { title: "Ufficio", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ errore?: string }> };

async function Avviso({ searchParams }: Props) {
  const { errore } = await searchParams;
  if (!adminConfigurato()) {
    return (
      <p role="alert" className="rounded-md border border-navy bg-ice px-4 py-3 text-sm">
        Accesso ufficio non ancora configurato: manca la variabile ADMIN_PASSWORD.
      </p>
    );
  }
  if (!errore) return null;
  return (
    <p role="alert" className="rounded-md border border-navy bg-ice px-4 py-3 text-sm">
      Password non valida.
    </p>
  );
}

export default function AccediAdmin({ searchParams }: Props) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <Logo />
        <p className="etichetta mt-10">Area ufficio</p>
        <h1 className="mt-1 text-3xl">Accesso DAV</h1>
        <form action={accediAdmin} className="mt-8 space-y-5">
          <Suspense fallback={null}>
            <Avviso searchParams={searchParams} />
          </Suspense>
          <div>
            <label htmlFor="password" className="etichetta block">
              Password ufficio
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
        </form>
      </div>
    </main>
  );
}
