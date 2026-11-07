"use server";

import { redirect } from "next/navigation";
import { cancellaSessione, creaSessioneAdmin, passwordAdminValida } from "@/lib/sessione";

export async function accediAdmin(formData: FormData): Promise<void> {
  const password = String(formData.get("password") ?? "");
  if (!passwordAdminValida(password)) {
    // Piccolo ritardo contro i tentativi ripetuti
    await new Promise((r) => setTimeout(r, 800));
    redirect("/admin/accedi?errore=1");
  }
  await creaSessioneAdmin();
  redirect("/admin");
}

export async function esciAdmin(): Promise<void> {
  await cancellaSessione();
  redirect("/admin/accedi");
}
