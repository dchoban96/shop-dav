import type { ReactNode } from "react";

/**
 * L'unico contenitore di pagina del sito: 1152 px (max-w-6xl), centrato, margine laterale 16 px.
 * Lo usano header, footer, sezioni pubbliche e tutte le pagine, area ufficio compresa, così i
 * bordi di testata e contenuto coincidono sempre. Le pagine strette (login, recupero) mettono una
 * colonna interna più stretta dentro questo contenitore, mai un contenitore diverso.
 */
type Props = { children: ReactNode; className?: string };

export function Contenitore({ children, className }: Props) {
  return <div className={`mx-auto w-full max-w-6xl px-4 ${className ?? ""}`}>{children}</div>;
}
