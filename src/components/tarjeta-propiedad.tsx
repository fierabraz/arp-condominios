import Link from "next/link";
import { Check, CircleAlert } from "lucide-react";
import { nombrePeriodo } from "@/lib/cobro";
import type { ResumenPropiedad } from "@/lib/resumen-propiedades";

const pct = (x: number) => `${Math.round(x)}%`;

function Estado({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex w-full items-center gap-2 rounded-xl px-3 py-1.5 text-sm ${
        ok ? "bg-exito-suave text-exito" : "bg-alerta-suave text-alerta"
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
    <div className="grid gap-4 border-b border-borde bg-white px-5 py-4 last:border-b-0 md:grid-cols-[1.3fr_1fr_1fr_1fr] md:items-center">
      <div>
        <p className="text-lg font-semibold">{p.nombre}</p>
        {p.rut ? (
          <p className="text-sm text-texto-suave">
            RUT: <span className="font-semibold text-texto">{p.rut}</span>
          </p>
        ) : (
          <p className="text-sm text-texto-suave">{p.direccion}</p>
        )}
        {conBoton && (
          <Link
            href={`/condominios/${p.id}`}
            className="mt-2 inline-flex min-h-11 items-center rounded-xl bg-marca px-4 text-sm font-semibold text-white hover:bg-marca-oscuro"
          >
            Ver propiedad
          </Link>
        )}
      </div>
      <div className="space-y-2">
        <p className="text-sm text-texto-suave">Último gasto común emitido:</p>
        <p className="font-semibold">{p.ultimoPeriodo ? nombrePeriodo(p.ultimoPeriodo.anio, p.ultimoPeriodo.mes) : "—"}</p>
        {p.ultimoPeriodo && (
          <Estado ok={notificado}>{notificado ? "Notificación enviada" : `Notificados ${p.notificados} de ${p.avisos}`}</Estado>
        )}
      </div>
      <div className="space-y-2">
        <p className="text-sm text-texto-suave">Recaudación del último mes:</p>
        <p className="font-semibold">{p.recaudacion === null ? "—" : pct(p.recaudacion)}</p>
        {p.recaudacion !== null && (
          <Estado ok={p.recaudacion >= 99.5}>{p.recaudacion >= 99.5 ? "Recaudación al día" : "Pagos pendientes"}</Estado>
        )}
      </div>
      <div className="space-y-2">
        <p className="text-sm text-texto-suave">Morosidad:</p>
        <p className={`font-semibold ${p.morosidad > 0 ? "text-peligro" : ""}`}>{pct(p.morosidad)}</p>
        <Link
          href={`/condominios/${p.id}/morosidad`}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-gray-300 px-3 text-sm font-semibold hover:bg-fondo"
        >
          Ir a Morosidad
        </Link>
      </div>
    </div>
  );
}
