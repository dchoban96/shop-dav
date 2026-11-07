"use server";

import { redirect } from "next/navigation";
import {
  cancellaSessione,
  codiceDemoValido,
  creaSessione,
  normalizzaCodice,
} from "@/lib/sessione";

/** Accesso demo: codice cliente come login e come password. */
export async function accedi(formData: FormData): Promise<void> {
  const codice = normalizzaCodice(formData.get("codice"));
  const password = normalizzaCodice(formData.get("password"));
  if (!codiceDemoValido(codice) || password !== codice) {
    redirect("/accedi?errore=1");
  }
  await creaSessione(codice);
  redirect("/home");
}

export async function esci(): Promise<void> {
  await cancellaSessione();
  redirect("/accedi");
}
