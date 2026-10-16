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
