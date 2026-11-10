"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { IconaGiu, IconaUtente } from "@/components/Icone";

/** Voci dell'area personale: ordini e documenti (schede della pagina Ordini), pagamenti, statistiche. */
const VOCI = [
  { href: "/ordini", label: "Ordini" },
  { href: "/ordini?scheda=ddt", label: "DDT" },
  { href: "/ordini?scheda=fatture", label: "Fatture" },
  { href: "/pagamenti", label: "Pagamenti" },
  { href: "/statistiche", label: "Statistiche" },
] as const;

type Props = { ragioneSociale?: string; codiceCliente: string };

/**
 * Nome del cliente nella testata come bottone dell'area personale: apre un menu con le voci.
 * Si chiude cliccando fuori, con Esc (il fuoco torna al bottone) o scegliendo una voce.
 */
export function MenuCliente({ ragioneSociale, codiceCliente }: Props) {
  const [aperto, setAperto] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const bottone = useRef<HTMLButtonElement>(null);
  const id = useId();
  const nome = ragioneSociale ?? "Cliente";

  useEffect(() => {
    if (!aperto) return;
    const fuori = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setAperto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setAperto(false);
      bottone.current?.focus();
    };
    document.addEventListener("pointerdown", fuori);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", fuori);
      document.removeEventListener("keydown", esc);
    };
  }, [aperto]);

  return (
    <div ref={box} className="relative">
      <button
        ref={bottone}
        type="button"
        onClick={() => setAperto((a) => !a)}
        aria-expanded={aperto}
        aria-controls={id}
        className="flex h-10 items-center gap-2 rounded-md border border-azzurro/60 px-3 text-sm font-semibold text-navy transition-colors hover:bg-ice"
      >
        <IconaUtente />
        <span className="hidden max-w-[180px] truncate lg:inline" title={nome}>
          {nome}
        </span>
        <span className="sr-only lg:hidden">Area personale</span>
        <IconaGiu className={`transition-transform motion-reduce:transition-none ${aperto ? "rotate-180" : ""}`} width={16} height={16} />
      </button>

      {aperto && (
        <div id={id} className="absolute right-0 top-full z-30 mt-2 w-64 overflow-hidden rounded-lg border border-azzurro/40 bg-bianco shadow-lg">
          <div className="border-b border-ice px-4 py-3">
            <p className="etichetta">Area personale</p>
            <p className="mt-1 text-sm font-semibold leading-snug text-navy">{nome}</p>
            <p className="text-xs text-slate">codice {codiceCliente}</p>
          </div>
          <ul className="py-1">
            {VOCI.map((v) => (
              <li key={v.href}>
                <Link href={v.href} onClick={() => setAperto(false)} className="block px-4 py-2.5 text-sm font-semibold text-navy hover:bg-ice">
                  {v.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
