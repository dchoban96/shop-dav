/**
 * Registro su console (il servizio Windows lo salva in logs/). Una riga per evento,
 * con data e ora. Niente password e niente dati personali oltre a codice cliente e riferimento.
 */
const ora = () => {
  const d = new Date();
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

export const registro = {
  info: (msg: string) => console.log(`${ora()} INFO  ${msg}`),
  avviso: (msg: string) => console.warn(`${ora()} AVVISO ${msg}`),
  errore: (msg: string, e?: unknown) => console.error(`${ora()} ERRORE ${msg}${e ? `: ${messaggio(e)}` : ""}`),
};

export function messaggio(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}
