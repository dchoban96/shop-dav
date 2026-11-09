"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { inviaEmailOrdine } from "@/lib/email/ordine";
import { leggiImpostazioni } from "@/lib/dati/admin";
import {
  aggiornaRiga,
  aggiungiAlCarrello,
  clientePerCodice,
  confermaOrdine,
  ordinePerId,
  rimuoviRiga,
  segnaEmailInviata,
  type Cliente,
} from "@/lib/dati/ordini";
import { dettaglioDocumento } from "@/lib/dati/documenti";
import { leggiSessione } from "@/lib/sessione";

async function clienteCorrente(): Promise<Cliente> {
  const s = await leggiSessione();
  if (!s || s.ruolo !== "cliente") redirect("/accedi");
  const c = await clientePerCodice(s.codiceCliente);
  if (!c) redirect("/accedi");
  return c;
}

const intero = (v: FormDataEntryValue | null, min = 0): number => {
  const n = Math.floor(Number(String(v ?? "").replace(",", ".")));
  return Number.isFinite(n) && n >= min ? n : min;
};

/** Aggiunge un articolo (campi: cod_dav, qta, torna). */
export async function aggiungi(formData: FormData): Promise<void> {
  const c = await clienteCorrente();
  const cod = String(formData.get("cod_dav") ?? "").trim();
  const qta = intero(formData.get("qta"), 0) || 1;
  if (cod) await aggiungiAlCarrello(c.id, cod, qta);
  const torna = String(formData.get("torna") ?? "");
  refresh();
  if (torna.startsWith("/")) redirect(torna);
}

/**
 * Home, "I tuoi articoli": un form solo. Campi `qta:<cod_dav>`;
 * bottone `solo=<cod_dav>` aggiunge quello, bottone `tutto` aggiunge tutti.
 */
export async function aggiungiDaStorico(formData: FormData): Promise<void> {
  const c = await clienteCorrente();
  const solo = formData.get("solo");
  const codici = solo
    ? [String(solo)]
    : [...formData.keys()].filter((k) => k.startsWith("qta:")).map((k) => k.slice(4));
  let aggiunti = 0;
  for (const cod of codici) {
    const qta = intero(formData.get(`qta:${cod}`), 0);
    if (qta > 0) {
      await aggiungiAlCarrello(c.id, cod, qta);
      aggiunti++;
    }
  }
  refresh();
  if (!solo && aggiunti > 0) redirect("/carrello");
}

/** Carrello: quantità di una riga (campi: riga, azione = meno | piu | imposta, qta). */
export async function cambiaQuantita(formData: FormData): Promise<void> {
  const c = await clienteCorrente();
  const riga = intero(formData.get("riga"));
  const azione = String(formData.get("azione") ?? "imposta");
  const attuale = intero(formData.get("attuale"));
  let nuova = intero(formData.get("qta"));
  if (azione === "piu") nuova = attuale + 1;
  if (azione === "meno") nuova = attuale - 1;
  if (riga) await aggiornaRiga(c.id, riga, { quantita: nuova });
  refresh();
}

export async function salvaNotaRiga(formData: FormData): Promise<void> {
  const c = await clienteCorrente();
  const riga = intero(formData.get("riga"));
  if (riga) await aggiornaRiga(c.id, riga, { note: String(formData.get("note") ?? "") });
  refresh();
}

export async function rimuovi(formData: FormData): Promise<void> {
  const c = await clienteCorrente();
  const riga = intero(formData.get("riga"));
  if (riga) await rimuoviRiga(c.id, riga);
  refresh();
}

/**
 * Conferma il carrello: prezzi copiati, stato inviato, email all'ufficio.
 * Il database assegna il riferimento SHOP-000123 e mette l'ordine in coda per NTS
 * (stato_nts = da_inviare): lo inserisce il connettore in LAN.
 */
export async function conferma(formData: FormData): Promise<void> {
  const c = await clienteCorrente();
  const data = String(formData.get("data_consegna") ?? "");
  const note = String(formData.get("note") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) redirect("/carrello?errore=data");
  let ordine;
  try {
    ordine = await confermaOrdine(c.id, data, note);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "errore";
    redirect(`/carrello?errore=${encodeURIComponent(msg)}`);
  }
  const dettaglio = await ordinePerId(c.id, ordine.id);
  if (dettaglio) {
    const { email_ordini } = await leggiImpostazioni();
    const esito = await inviaEmailOrdine({ cliente: c, ordine: dettaglio.ordine, righe: dettaglio.righe, emailUfficio: email_ordini });
    if (esito.inviata) await segnaEmailInviata(ordine.id);
  }
  refresh();
  redirect(`/ordini/${ordine.id}?confermato=1`);
}

/** "Riordina questo": copia le righe di un ordine passato nel carrello. */
export async function riordina(formData: FormData): Promise<void> {
  const c = await clienteCorrente();
  const id = intero(formData.get("ordine"));
  const dettaglio = id ? await ordinePerId(c.id, id) : null;
  if (!dettaglio) redirect("/ordini");
  for (const r of dettaglio.righe) await aggiungiAlCarrello(c.id, r.cod_dav, r.quantita);
  refresh();
  redirect("/carrello");
}

/**
 * "Riordina questi articoli" da un DDT: gli articoli del catalogo online, con le quantità del DDT
 * (la stessa unità di misura NTS del carrello). L'articolo generico M e quelli tolti dal sito si saltano.
 */
export async function riordinaDocumento(formData: FormData): Promise<void> {
  const c = await clienteCorrente();
  const id = intero(formData.get("documento"));
  const d = id ? await dettaglioDocumento(id, c.id) : null;
  if (!d || d.documento.tipo !== "ddt") redirect("/ordini?scheda=ddt");
  const quantita = new Map<string, number>();
  for (const r of d.righe) {
    if (r.tipo_riga !== "articolo" || !r.in_catalogo || !r.cod_dav || !(Number(r.quantita) > 0)) continue;
    quantita.set(r.cod_dav, (quantita.get(r.cod_dav) ?? 0) + Number(r.quantita));
  }
  for (const [cod, q] of quantita) await aggiungiAlCarrello(c.id, cod, q);
  refresh();
  redirect("/carrello");
}
