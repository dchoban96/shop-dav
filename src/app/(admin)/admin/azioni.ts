"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { cambiaStatoOrdine, salvaImpostazioni, STATI_ADMIN } from "@/lib/dati/admin";
import type { StatoOrdine } from "@/lib/dati/ordini";
import { leggiSessioneAdmin } from "@/lib/sessione";

async function richiediAdmin(): Promise<void> {
  if (!(await leggiSessioneAdmin())) redirect("/admin/accedi");
}

/** Cambia lo stato di un ordine (campi: ordine, stato). */
export async function aggiornaStato(formData: FormData): Promise<void> {
  await richiediAdmin();
  const id = Number(formData.get("ordine"));
  const stato = String(formData.get("stato") ?? "") as StatoOrdine;
  if (!Number.isInteger(id) || !STATI_ADMIN.includes(stato)) return;
  await cambiaStatoOrdine(id, stato);
  refresh();
}

export async function aggiornaImpostazioni(formData: FormData): Promise<void> {
  await richiediAdmin();
  const soglia = Number(String(formData.get("soglia_esaurimento") ?? "").replace(",", "."));
  const email = String(formData.get("email_ordini") ?? "").trim();
  if (!(soglia >= 0 && soglia <= 1000) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    redirect("/admin/impostazioni?errore=1");
  }
  await salvaImpostazioni({ soglia_esaurimento: soglia, email_ordini: email });
  refresh();
  redirect("/admin/impostazioni?salvato=1");
}
