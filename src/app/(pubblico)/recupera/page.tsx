import type { Metadata } from "next";
import Link from "next/link";
import { Bottone } from "@/components/Bottone";

export const metadata: Metadata = { title: "Recupera password" };

export default function Recupera() {
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <p className="etichetta">Area clienti</p>
      <h1 className="mt-2 text-3xl">Recupera la password</h1>
      <p className="mt-3 text-sm text-slate">
        Inserisci l’email con cui sei stato invitato: riceverai un link per impostare una nuova
        password.
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
        <Bottone type="submit" className="w-full" disabled>
          Invia il link
        </Bottone>
        <p className="text-sm">
          <Link href="/accedi" className="underline underline-offset-2">
            Torna all’accesso
          </Link>
        </p>
      </form>
    </div>
  );
}
