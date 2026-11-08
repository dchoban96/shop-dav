"use server";

import { redirect } from "next/navigation";
import { clientePerCodice } from "@/lib/dati/ordini";
import {
  cancellaSessione,
  codiceDemoValido,
  creaSessione,
  formatoCodiceValido,
  normalizzaCodice,
} from "@/lib/sessione";

/**
 * Accesso provvisorio: codice cliente NTS come login e come password.
 * Entra chi è in anagrafica (`clienti`, importata da NTS) oppure un codice demo,
 * per cui il cliente fittizio viene creato qui, una volta sola.
 */
export async function accedi(formData: FormData): Promise<void> {
  const codice = normalizzaCodice(formData.get("codice"));
  const password = normalizzaCodice(formData.get("password"));
  if (!formatoCodiceValido(codice) || password !== codice) {
    redirect("/accedi?errore=1");
  }
  const demo = codiceDemoValido(codice);
  const cliente = await clientePerCodice(codice, demo);
  if (!cliente || (cliente.demo && !demo)) {
    redirect("/accedi?errore=1");
  }
  await creaSessione(codice);
  redirect("/home");
}

export async function esci(): Promise<void> {
  await cancellaSessione();
  redirect("/accedi");
}
