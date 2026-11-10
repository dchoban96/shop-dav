"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { cambiaStatoOrdine, salvaImpostazioni, STATI_ADMIN } from "@/lib/dati/admin";
import type { StatoOrdine } from "@/lib/dati/ordini";
import { reinviaOrdineNts, segnaInseritoAMano } from "@/lib/dati/nts";
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
  // Clienti mandati a NTS in automatico: tutti, oppure solo i codici NTS elencati (virgole, spazi o a capo)
  const tutti = formData.get("clienti_nts") !== "solo";
  const codici = [...new Set(String(formData.get("codici_nts") ?? "").split(/[\s,;]+/).filter(Boolean))];
  if (
    !(soglia >= 0 && soglia <= 1000) ||
    !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ||
    (!tutti && (codici.length === 0 || codici.some((c) => !/^\d{1,10}$/.test(c))))
  ) {
    redirect("/admin/impostazioni?errore=1");
  }
  await salvaImpostazioni({
    soglia_esaurimento: soglia,
    email_ordini: email,
    clienti_nts: tutti ? { tutti: true } : { tutti: false, codici },
  });
  refresh();
  redirect("/admin/impostazioni?salvato=1");
}

/**
 * NTS, "Reinvia" (campi: ordine, conferma). Solo per ordini in errore mai arrivati in frontiera;
 * serve la spunta di conferma. Il connettore cerca comunque il riferimento prima di scrivere.
 */
export async function reinviaNts(formData: FormData): Promise<void> {
  await richiediAdmin();
  const id = Number(formData.get("ordine"));
  if (!Number.isInteger(id)) return;
  if (formData.get("conferma") !== "si") redirect(`/admin/ordini/${id}?nts=conferma`);
  const ok = await reinviaOrdineNts(id);
  refresh();
  redirect(`/admin/ordini/${id}?nts=${ok ? "reinviato" : "invariato"}`);
}

/** NTS, "Segna inserito a mano" (campi: ordine, nota obbligatoria). */
export async function segnaManualeNts(formData: FormData): Promise<void> {
  await richiediAdmin();
  const id = Number(formData.get("ordine"));
  const nota = String(formData.get("nota") ?? "").trim().slice(0, 500);
  if (!Number.isInteger(id)) return;
  if (nota.length < 3) redirect(`/admin/ordini/${id}?nts=nota`);
  const ok = await segnaInseritoAMano(id, nota);
  refresh();
  redirect(`/admin/ordini/${id}?nts=${ok ? "manuale" : "invariato"}`);
}
