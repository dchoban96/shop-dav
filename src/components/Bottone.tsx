import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variante = "primario" | "secondario";

const base =
  "inline-flex items-center justify-center gap-2 rounded-md px-5 py-3 text-sm font-semibold transition-colors min-h-12";
const varianti: Record<Variante, string> = {
  primario: "bg-navy text-bianco hover:bg-[#0d2144]",
  secondario: "border border-navy text-navy hover:bg-ice",
};

type LinkProps = { href: string; variante?: Variante; children: ReactNode; className?: string };

export function BottoneLink({ href, variante = "primario", children, className }: LinkProps) {
  return (
    <Link href={href} className={`${base} ${varianti[variante]} ${className ?? ""}`}>
      {children}
    </Link>
  );
}

type ButtonProps = ComponentProps<"button"> & { variante?: Variante };

export function Bottone({ variante = "primario", className, children, ...rest }: ButtonProps) {
  return (
    <button className={`${base} ${varianti[variante]} ${className ?? ""}`} {...rest}>
      {children}
    </button>
  );
}
