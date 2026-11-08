/* eslint-disable @next/next/no-img-element */
/**
 * Logo DAV: file ufficiali dalle brand guidelines, in `public/brand/`.
 * - logo-orizzontale.svg: header web, lettere, firme (rapporto 1475 × 540)
 * - emblema.svg: da solo, a 240 px o più (contiene la riga descrittiva)
 * - emblema-piccolo.svg: favicon, header mobile, sotto i 240 px
 * - logo-verticale*.svg: copertine e usi grandi; versioni reversed e bianca su fondi scuri
 * Non ridisegnare, non ricolorare, non deformare: usare i file così come sono.
 */

type EmblemaProps = { size?: number; className?: string; title?: string; bianco?: boolean };

export function Emblema({ size = 40, className, title = "Emblema DAV", bianco = false }: EmblemaProps) {
  const src = bianco ? "/brand/emblema-piccolo-bianco.svg" : size >= 240 ? "/brand/emblema.svg" : "/brand/emblema-piccolo.svg";
  return <img src={src} alt={title} width={size} height={size} className={className} />;
}

type LogoProps = { className?: string; compatto?: boolean };

/**
 * Logo orizzontale. In modalità compatta (header): sotto i 640 px di schermo solo
 * l'emblema piccolo (36 px); sopra, la versione orizzontale "small-use" a 52 px di
 * altezza, cioè 142 px di larghezza, sopra il minimo di 140 px delle guidelines.
 */
export function Logo({ className, compatto = false }: LogoProps) {
  const altezza = compatto ? 52 : 56;
  const larghezza = Math.round((altezza * 1475) / 540);
  const file = compatto ? "/brand/logo-orizzontale-piccolo.svg" : "/brand/logo-orizzontale.svg";
  return (
    <span className={`inline-flex items-center ${className ?? ""}`}>
      {compatto && (
        <img
          src="/brand/emblema-piccolo.svg"
          alt="DAV"
          width={36}
          height={36}
          className="sm:hidden"
        />
      )}
      <img
        src={file}
        alt="DAV, Distribuzione Alimentare Valtellinese"
        width={larghezza}
        height={altezza}
        className={compatto ? "hidden sm:block" : ""}
      />
    </span>
  );
}
