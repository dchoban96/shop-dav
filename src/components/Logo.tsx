/**
 * Logo DAV.
 * Segnaposto costruito in SVG secondo le brand guidelines (emblema tondo con
 * monogramma D-A-V: D e V in navy, A in azzurro; nome su tre righe con
 * ALIMENTARE in azzurro). Va sostituito con i file ufficiali in `public/brand/`
 * appena disponibili, mantenendo le stesse proporzioni.
 */

type EmblemaProps = { size?: number; className?: string; title?: string };

export function Emblema({ size = 40, className, title = "Emblema DAV" }: EmblemaProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={title}
      className={className}
    >
      <circle cx="50" cy="50" r="47" fill="none" stroke="#122C5A" strokeWidth="4" />
      <text
        x="50"
        y="60"
        textAnchor="middle"
        fontFamily="var(--font-baskerville), Georgia, serif"
        fontSize="34"
        letterSpacing="2"
      >
        <tspan fill="#122C5A">D</tspan>
        <tspan fill="#90B1CA">A</tspan>
        <tspan fill="#122C5A">V</tspan>
      </text>
    </svg>
  );
}

type LogoProps = { className?: string; compatto?: boolean };

export function Logo({ className, compatto = false }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-3 ${className ?? ""}`}>
      <Emblema size={compatto ? 36 : 48} />
      <span
        className={`font-serif leading-[1.05] text-navy ${compatto ? "hidden sm:block text-[11px]" : "text-[13px]"}`}
        style={{ letterSpacing: "0.04em" }}
      >
        <span className="block">DISTRIBUZIONE</span>
        <span className="block text-azzurro">ALIMENTARE</span>
        <span className="block">VALTELLINESE</span>
      </span>
    </span>
  );
}
