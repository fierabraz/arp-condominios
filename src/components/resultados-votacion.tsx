import { formatoPorcentaje } from "@/lib/formato";
import type { ResultadoOpcion } from "@/lib/votacion";

/** Barras de resultados de una votación. */
export function ResultadosVotacion({
  opciones,
  ganadoraId,
  ponderada,
}: {
  opciones: ResultadoOpcion[];
  ganadoraId?: string;
  ponderada: boolean;
}) {
  return (
    <ul className="space-y-3">
      {opciones.map((o) => (
        <li key={o.id}>
          <div className="mb-1 flex justify-between gap-4 text-sm">
            <span className={o.id === ganadoraId ? "font-semibold" : ""}>
              {o.texto}
              {o.id === ganadoraId && <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-700">Mayoría</span>}
            </span>
            <span className="tabular-nums text-gray-600">
              {formatoPorcentaje(o.porcentaje, 1)} · {o.votos} {o.votos === 1 ? "unidad" : "unidades"}
              {ponderada && ` · ${formatoPorcentaje(o.peso, 2)} de alícuota`}
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full rounded-full ${o.id === ganadoraId ? "bg-emerald-500" : "bg-blue-400"}`}
              style={{ width: `${o.porcentaje}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
