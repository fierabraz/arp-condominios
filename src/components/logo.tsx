import { MARCA } from "@/lib/marca";

/** Símbolo de la marca (provisorio: la inicial sobre el color de marca) y su nombre. */
export function Logo({ subtitulo, tamano = "md" }: { subtitulo?: string; tamano?: "md" | "lg" }) {
  const caja = tamano === "lg" ? "h-12 w-12 text-xl" : "h-10 w-10 text-lg";
  return (
    <div className="flex items-center gap-3">
      <div aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-xl bg-marca font-bold text-white ${caja}`}>
        {MARCA.nombre.charAt(0)}
      </div>
      <div className="min-w-0">
        <p className={`truncate font-bold ${tamano === "lg" ? "text-xl" : "text-base"}`}>{MARCA.nombre}</p>
        {subtitulo && <p className="truncate text-sm text-texto-suave">{subtitulo}</p>}
      </div>
    </div>
  );
}

/** Símbolo del portal del residente: una "C" turquesa con un trazo naranja. */
export function SimboloConvive({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" className={`shrink-0 ${className}`}>
      <path d="M31 9.5A15 15 0 1 0 31 30.5" fill="none" stroke="var(--color-convive)" strokeWidth="7" strokeLinecap="round" />
      <path d="M31 30.5A15 15 0 0 1 9 26" fill="none" stroke="var(--color-naranja)" strokeWidth="7" strokeLinecap="round" />
      <circle cx="20" cy="20" r="4.5" fill="var(--color-convive-oscuro)" />
    </svg>
  );
}

/** Logo del portal del residente, con la paleta Convive. */
export function LogoResidente() {
  return (
    <div className="flex items-center gap-2">
      <SimboloConvive className="h-9 w-9" />
      <span className="text-xl font-bold tracking-tight text-convive-oscuro">{MARCA.nombre}</span>
    </div>
  );
}
