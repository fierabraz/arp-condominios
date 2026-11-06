import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { nombrePeriodo } from "@/lib/cobro";
import type { DiaCalendario, EstadoDia } from "@/lib/reservas";

// RES-001 · Calendario del mes de un espacio común: muestra de un vistazo qué días están libres.
// Lo usan el residente y la administración. Sin JavaScript: cada día es un enlace.

const ESTILO: Record<EstadoDia, string> = {
  libre: "bg-exito-suave text-exito border-exito/30 hover:ring-2 hover:ring-exito/40",
  parcial: "bg-alerta-suave text-alerta border-alerta/30 hover:ring-2 hover:ring-alerta/40",
  ocupado: "bg-peligro-suave text-peligro border-peligro/30",
  fuera: "bg-gray-50 text-gray-400 border-transparent",
};

export const TEXTO_ESTADO_DIA: Record<EstadoDia, string> = {
  libre: "Libre",
  parcial: "Queda un turno",
  ocupado: "Ocupado",
  fuera: "No disponible",
};

const DIAS_SEMANA = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];

export function CalendarioReservas({
  anio,
  mes,
  semanas,
  totalTurnos,
  elegido,
  hrefDia,
  hrefMesAnterior,
  hrefMesSiguiente,
  /** La administración puede abrir también los días ocupados, para ver quién reservó. */
  abrirOcupados = false,
}: {
  anio: number;
  mes: number;
  semanas: (DiaCalendario | null)[][];
  totalTurnos: number;
  elegido?: string;
  hrefDia: (dia: string) => string;
  hrefMesAnterior?: string;
  hrefMesSiguiente?: string;
  abrirOcupados?: boolean;
}) {
  const textoParcial = (d: DiaCalendario) =>
    totalTurnos > 1 && d.turnosLibres.length > 1 ? `Quedan ${d.turnosLibres.length} turnos` : TEXTO_ESTADO_DIA.parcial;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        {hrefMesAnterior ? (
          <Link href={hrefMesAnterior} scroll={false} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-borde bg-white hover:bg-convive-suave" aria-label="Mes anterior">
            <ChevronLeft size={20} aria-hidden="true" />
          </Link>
        ) : (
          <span className="min-w-11" />
        )}
        <h3 className="text-lg font-bold text-convive-oscuro">{nombrePeriodo(anio, mes)}</h3>
        {hrefMesSiguiente ? (
          <Link href={hrefMesSiguiente} scroll={false} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-borde bg-white hover:bg-convive-suave" aria-label="Mes siguiente">
            <ChevronRight size={20} aria-hidden="true" />
          </Link>
        ) : (
          <span className="min-w-11" />
        )}
      </div>
      <table className="w-full table-fixed border-separate border-spacing-1 text-center">
        <thead>
          <tr>
            {DIAS_SEMANA.map((d) => (
              <th key={d} scope="col" className="pb-1 text-xs font-semibold text-texto-suave">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {semanas.map((semana, i) => (
            <tr key={i}>
              {semana.map((d, j) => {
                if (!d) return <td key={j} />;
                const etiqueta = d.estado === "parcial" ? textoParcial(d) : TEXTO_ESTADO_DIA[d.estado];
                const clases = `flex aspect-square min-h-11 w-full flex-col items-center justify-center rounded-xl border text-sm font-bold ${ESTILO[d.estado]} ${
                  d.dia === elegido ? "ring-2 ring-convive-oscuro ring-offset-1" : ""
                } ${d.hoy ? "underline decoration-2 underline-offset-4" : ""}`;
                const abrible = d.estado === "libre" || d.estado === "parcial" || (abrirOcupados && d.estado === "ocupado");
                return (
                  <td key={j} className="p-0">
                    {abrible ? (
                      <Link
                        href={hrefDia(d.dia)}
                        scroll={false}
                        aria-label={`${d.numero}: ${etiqueta}`}
                        aria-current={d.dia === elegido ? "date" : undefined}
                        className={clases}
                      >
                        {d.numero}
                      </Link>
                    ) : (
                      <span className={clases} aria-label={`${d.numero}: ${etiqueta}`}>
                        {d.numero}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-texto-suave" aria-label="Significado de los colores">
        {(["libre", "parcial", "ocupado", "fuera"] as const)
          .filter((e) => e !== "parcial" || totalTurnos > 1)
          .map((e) => (
            <li key={e} className="flex items-center gap-1.5">
              <span aria-hidden="true" className={`inline-block h-3.5 w-3.5 rounded border ${ESTILO[e]}`} />
              {e === "parcial" ? "Quedan turnos libres" : TEXTO_ESTADO_DIA[e]}
            </li>
          ))}
      </ul>
    </div>
  );
}
