/**
 * Unità di misura NTS → parola per esteso (tooltip e testi).
 * Modulo puro, importabile anche dai componenti client.
 */
const UNITA: Record<string, string> = {
  KG: "chilogrammi",
  LT: "litri",
  PZ: "pezzi",
  CT: "cartone",
  CF: "confezione",
  BU: "busta",
  FI: "fila",
};

export function descriviUm(um: string | null | undefined): string | null {
  if (!um) return null;
  return UNITA[um.toUpperCase()] ?? um;
}
