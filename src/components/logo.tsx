import Image from "next/image";
import { MARCA } from "@/lib/marca";

/** Símbolo de la marca: la "C" Convive con su punto naranja (imagen del logo oficial). */
export function SimboloConvive({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <Image
      src={MARCA.simbolo.src}
      width={MARCA.simbolo.ancho}
      height={MARCA.simbolo.alto}
      alt=""
      aria-hidden="true"
      priority
      className={`shrink-0 object-contain ${className}`}
    />
  );
}

/** Nombre de la marca con su tipografía del logo. El texto alternativo lo lee el lector de pantalla. */
function NombreMarca({ className }: { className: string }) {
  return (
    <Image
      src={MARCA.nombreImagen.src}
      width={MARCA.nombreImagen.ancho}
      height={MARCA.nombreImagen.alto}
      alt={MARCA.nombre}
      priority
      className={`w-auto object-contain object-left ${className}`}
    />
  );
}

/** Logo horizontal (símbolo + nombre) para toda la app, con un subtítulo opcional. */
export function Logo({ subtitulo, tamano = "md" }: { subtitulo?: string; tamano?: "md" | "lg" }) {
  return (
    <div className="flex items-center gap-2.5">
      <SimboloConvive className={tamano === "lg" ? "h-12 w-12" : "h-10 w-10"} />
      <div className="min-w-0">
        <NombreMarca className={tamano === "lg" ? "h-8" : "h-6"} />
        {subtitulo && <p className="mt-0.5 truncate text-sm text-texto-suave">{subtitulo}</p>}
      </div>
    </div>
  );
}

/** Logo vertical completo (como lo entregó la marca), para la pantalla de ingreso. */
export function LogoCompleto({ className = "h-32" }: { className?: string }) {
  return (
    <Image
      src={MARCA.logoCompleto.src}
      width={MARCA.logoCompleto.ancho}
      height={MARCA.logoCompleto.alto}
      alt={MARCA.nombre}
      priority
      className={`w-auto object-contain ${className}`}
    />
  );
}

/** Logo del portal del residente. */
export function LogoResidente() {
  return <Logo />;
}
