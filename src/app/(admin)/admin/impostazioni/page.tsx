import { Suspense } from "react";
import { Bottone } from "@/components/Bottone";
import { leggiImpostazioni } from "@/lib/dati/admin";
import { aggiornaImpostazioni } from "../azioni";
import { Contenitore } from "@/components/Contenitore";

export const metadata = { title: "Impostazioni" };

type Props = { searchParams: Promise<{ salvato?: string; errore?: string }> };

const campo = "mt-2 w-full rounded-md border border-azzurro bg-bianco px-4 py-3 text-base";

async function Modulo({ searchParams }: Props) {
  const [{ salvato, errore }, imp] = await Promise.all([searchParams, leggiImpostazioni()]);
  return (
    <form action={aggiornaImpostazioni} className="max-w-lg space-y-6">
      {salvato && (
        <p role="status" className="rounded-md bg-ice px-4 py-3 text-sm">
          Impostazioni salvate.
        </p>
      )}
      {errore && (
        <p role="alert" className="rounded-md border border-navy bg-ice px-4 py-3 text-sm">
          Controlla i valori: la soglia va da 0 a 1000, l’email deve essere valida e, se scegli “solo questi clienti”, servono uno o più
          codici NTS (solo numeri).
        </p>
      )}
      <div>
        <label htmlFor="soglia_esaurimento" className="etichetta block">
          Soglia “in esaurimento”
        </label>
        <input id="soglia_esaurimento" name="soglia_esaurimento" type="number" min={0} max={1000} step="any" defaultValue={imp.soglia_esaurimento} className={campo} />
        <p className="mt-1 text-xs text-slate">
          Sotto questa giacenza l’articolo appare “in esaurimento”; a zero “su ordinazione”. I clienti non vedono mai la quantità.
        </p>
      </div>
      <div>
        <label htmlFor="email_ordini" className="etichetta block">
          Email che riceve gli ordini
        </label>
        <input id="email_ordini" name="email_ordini" type="email" required defaultValue={imp.email_ordini} className={campo} />
        <p className="mt-1 text-xs text-slate">Ogni ordine confermato arriva qui, con copia al cliente se ha un’email.</p>
      </div>
      <fieldset>
        <legend className="etichetta block">Ordini mandati a NTS in automatico</legend>
        <label className="mt-2 flex items-center gap-2 text-base">
          <input type="radio" name="clienti_nts" value="tutti" defaultChecked={imp.clienti_nts?.tutti !== false} />
          Tutti i clienti
        </label>
        <label className="mt-2 flex items-center gap-2 text-base">
          <input type="radio" name="clienti_nts" value="solo" defaultChecked={imp.clienti_nts?.tutti === false} />
          Solo questi clienti (codice NTS)
        </label>
        <textarea
          name="codici_nts"
          aria-label="Codici NTS dei clienti abilitati"
          rows={2}
          defaultValue={imp.clienti_nts?.tutti === false ? imp.clienti_nts.codici.join(", ") : ""}
          placeholder="es. 140100001, 140100002"
          className={campo}
        />
        <p className="mt-1 text-xs text-slate">
          Il connettore lo rilegge a ogni giro (30 s). Gli ordini degli altri clienti vanno in errore con email: l’ufficio li inserisce a mano in NTS.
          {imp.clienti_nts === null && " Finché non salvi qui vale l’elenco nel file .env del connettore."}
        </p>
      </fieldset>
      <Bottone type="submit">Salva</Bottone>
    </form>
  );
}

export default function Impostazioni({ searchParams }: Props) {
  return (
    <Contenitore className="py-8">
      <p className="etichetta">Ufficio DAV</p>
      <h1 className="mt-1 text-3xl">Impostazioni</h1>
      <div className="mt-6">
        <Suspense fallback={<p className="text-sm text-slate">Carico…</p>}>
          <Modulo searchParams={searchParams} />
        </Suspense>
      </div>
    </Contenitore>
  );
}
