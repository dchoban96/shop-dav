import type { ComponentProps } from "react";

type Props = ComponentProps<"svg">;

const base = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.25,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

export function IconaMeno(p: Props) {
  return (
    <svg {...base} {...p}>
      <path d="M5 12h14" />
    </svg>
  );
}

export function IconaPiu(p: Props) {
  return (
    <svg {...base} {...p}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconaCarrello(p: Props) {
  return (
    <svg {...base} {...p}>
      <circle cx="9" cy="21" r="1" />
      <circle cx="19" cy="21" r="1" />
      <path d="M2.5 3h2.2l2.5 12.4a2 2 0 0 0 2 1.6h9.3a2 2 0 0 0 2-1.6L22 7H6" />
    </svg>
  );
}

export function IconaUtente(p: Props) {
  return (
    <svg {...base} {...p}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

export function IconaGiu(p: Props) {
  return (
    <svg {...base} {...p}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/** Disponibile */
export function IconaVerifica(p: Props) {
  return (
    <svg {...base} {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </svg>
  );
}

/** In esaurimento */
export function IconaAvviso(p: Props) {
  return (
    <svg {...base} {...p}>
      <path d="M10.3 4.2 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9.5v4M12 17h.01" />
    </svg>
  );
}

/** Su ordinazione */
export function IconaOrologio(p: Props) {
  return (
    <svg {...base} {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

/** Disponibilità in aggiornamento */
export function IconaAggiorna(p: Props) {
  return (
    <svg {...base} {...p}>
      <path d="M20 11a8 8 0 0 0-14.6-4.5L4 8" />
      <path d="M4 3.5V8h4.5" />
      <path d="M4 13a8 8 0 0 0 14.6 4.5L20 16" />
      <path d="M20 20.5V16h-4.5" />
    </svg>
  );
}
