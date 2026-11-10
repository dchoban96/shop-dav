/**
 * Giacenza da NTS allo shop (decisioni del 10/11/2026):
 *  - esistenza piena del magazzino 1 (artpro.ap_esist), come la vedono gli agenti sul palmare;
 *  - gli articoli dello shop senza progressivi valgono 0 → "su ordinazione" (a zero o negativa idem);
 *  - ogni 15 minuti dal servizio del connettore; su Supabase si scrivono solo le giacenze cambiate.
 * Il cliente non vede mai la quantità: lo shop mostra "disponibile" o "su ordinazione"
 * ("in esaurimento" per ora spento: soglia 0 in Impostazioni).
 */
import { registro, messaggio } from "./registro.js";

export type GiacenzaNts = { codart: string; esist: number };
export type Giacenza = { cod_dav: string; quantita: number };

export interface PortaGiacenzeShop {
  codiciArticoli(): Promise<string[]>;
  giacenzeAttuali(): Promise<Map<string, number>>;
  scriviGiacenze(righe: Giacenza[]): Promise<void>;
}

const chiave = (c: string) => String(c ?? "").trim().toUpperCase();
/** Tre decimali come la colonna giacenze.quantita (numeric(14,3)). */
const tre = (n: number) => Math.round(n * 1000) / 1000;

/** Giacenza di ogni articolo dello shop: quella di NTS, 0 se l'articolo non ha progressivi. */
export function giacenzeShop(codiciShop: string[], nts: GiacenzaNts[]): Map<string, number> {
  const daNts = new Map<string, number>();
  for (const g of nts) daNts.set(chiave(g.codart), (daNts.get(chiave(g.codart)) ?? 0) + (Number(g.esist) || 0));
  return new Map(codiciShop.map((cod) => [cod, tre(daNts.get(chiave(cod)) ?? 0)]));
}

/** Solo le giacenze nuove o cambiate rispetto a quelle già nello shop. */
export function differenze(nuove: Map<string, number>, attuali: Map<string, number>): Giacenza[] {
  const out: Giacenza[] = [];
  for (const [cod_dav, quantita] of nuove) {
    const prima = attuali.get(cod_dav);
    if (prima === undefined || Math.abs(prima - quantita) > 0.0005) out.push({ cod_dav, quantita });
  }
  return out;
}

export type Esito = { articoli: number; daNts: number; disponibili: number; cambiate: number; scritte: boolean };

/** Sincronizzazione periodica: `forse()` la esegue solo se sono passati `ogniMinuti` dall'ultima riuscita. */
export class SincronizzaGiacenze {
  /** Ultima sincronizzazione riuscita (null = mai: la prima parte subito). */
  private ultima: number | null = null;

  constructor(
    private ogniMinuti: number,
    private leggiNts: () => Promise<GiacenzaNts[]>,
    private shop: PortaGiacenzeShop,
    private adesso: () => number = Date.now,
  ) {}

  get attiva(): boolean {
    return this.ogniMinuti > 0;
  }

  async forse(): Promise<Esito | null> {
    if (!this.attiva || (this.ultima !== null && this.adesso() - this.ultima < this.ogniMinuti * 60000)) return null;
    try {
      const esito = await this.esegui(true);
      this.ultima = this.adesso();
      registro.info(`giacenze: ${esito.cambiate} cambiate su ${esito.articoli} articoli (${esito.disponibili} disponibili)`);
      return esito;
    } catch (e) {
      // si riprova al giro successivo
      registro.errore("giacenze non aggiornate", messaggio(e));
      return null;
    }
  }

  async esegui(scrivere: boolean): Promise<Esito> {
    const [nts, codici, attuali] = await Promise.all([this.leggiNts(), this.shop.codiciArticoli(), this.shop.giacenzeAttuali()]);
    const nuove = giacenzeShop(codici, nts);
    const cambiate = differenze(nuove, attuali);
    if (scrivere && cambiate.length) await this.shop.scriviGiacenze(cambiate);
    return {
      articoli: nuove.size,
      daNts: nts.length,
      disponibili: [...nuove.values()].filter((q) => q > 0).length,
      cambiate: cambiate.length,
      scritte: scrivere,
    };
  }
}
