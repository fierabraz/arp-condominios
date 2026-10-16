import Link from "next/link";
import { Check, CircleAlert } from "lucide-react";
import { nombrePeriodo } from "@/lib/cobro";
import type { ResumenPropiedad } from "@/lib/resumen-propiedades";

const pct = (x: number) => `${Math.round(x)}%`;

function Estado({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm ${
        ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"
      }`}
    >
      {ok ? <Check size={15} /> : <CircleAlert size={15} />} {children}
    </span>
  );
}

/** Fila de resumen de una propiedad, como en Mis propiedades y en el panel. */
export function TarjetaPropiedad({ p, conBoton = true }: { p: ResumenPropiedad; conBoton?: boolean }) {
  const notificado = p.avisos > 0 && p.notificados === p.avisos;
  return (
    <div className="grid gap-4 border-b border-gray-200 bg-white px-5 py-4 last:border-b-0 md:grid-cols-[1.3fr_1fr_1fr_1fr] md:items-center">
      <div>
        <p className="text-lg font-semibold">{p.nombre}</p>
        {p.rut ? (
          <p className="text-sm text-gray-600">
            RUT: <span className="font-semibold text-gray-800">{p.rut}</span>
          </p>
        ) : (
          <p className="text-sm text-gray-500">{p.direccion}</p>
        )}
        {conBoton && (
          <Link
            href={`/condominios/${p.id}`}
            className="mt-2 inline-flex rounded-md bg-emerald-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-600"
          >
            Ver propiedad
          </Link>
        )}
      </div>
      <div className="space-y-2">
        <p className="text-sm text-gray-500">Último gasto común emitido:</p>
        <p className="font-semibold">{p.ultimoPeriodo ? nombrePeriodo(p.ultimoPeriodo.anio, p.ultimoPeriodo.mes) : "—"}</p>
        {p.ultimoPeriodo && (
          <Estado ok={notificado}>{notificado ? "Notificación enviada" : `Notificados ${p.notificados} de ${p.avisos}`}</Estado>
        )}
      </div>
      <div className="space-y-2">
        <p className="text-sm text-gray-500">Recaudación del último mes:</p>
        <p className="font-semibold">{p.recaudacion === null ? "—" : pct(p.recaudacion)}</p>
        {p.recaudacion !== null && (
          <Estado ok={p.recaudacion >= 99.5}>{p.recaudacion >= 99.5 ? "Recaudación al día" : "Pagos pendientes"}</Estado>
        )}
      </div>
      <div className="space-y-2">
        <p className="text-sm text-gray-500">Morosidad:</p>
        <p className={`font-semibold ${p.morosidad > 0 ? "text-red-700" : ""}`}>{pct(p.morosidad)}</p>
        <Link
          href={`/condominios/${p.id}/morosidad`}
          className="inline-flex w-full justify-center rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          Ir a Morosidad
        </Link>
      </div>
    </div>
  );
}
