"use client";

// FIN-COMP A · Formularios para conciliar un abono: registrar el pago de una unidad (con distribución)
// u otro ingreso de la comunidad. Nada se confirma solo.

import { useActionState, useState } from "react";
import { Boton, Campo, Input, Mensaje, Select } from "@/components/ui";
import { DistribucionPago, type AvisoParaDistribuir } from "@/components/distribucion-pago";
import type { EstadoForm } from "@/lib/forms";
import type { EstadoIngreso } from "@/app/(app)/condominios/ingresos-actions";

export type UnidadOpcion = { id: string; numero: string; deuda: number; sugerida: boolean; avisos: AvisoParaDistribuir[] };

const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;

export function FormularioPagoUnidad({
  accion,
  unidades,
  restante,
  inicial,
}: {
  accion: (e: EstadoIngreso, f: FormData) => Promise<EstadoIngreso>;
  unidades: UnidadOpcion[];
  restante: number;
  inicial?: string;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  const [unidadId, setUnidadId] = useState(inicial ?? "");
  const [monto, setMonto] = useState(String(Math.round(restante)));
  const [duplicadoOk, setDuplicadoOk] = useState(false);
  const elegida = unidades.find((u) => u.id === unidadId);
  const montoNum = Number(monto.replace(/\D/g, "")) || 0;
  if (estado.ok) return <Mensaje tipo="ok" texto={estado.mensaje} />;
  return (
    <form action={enviar} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Unidad que pagó" error={estado.errores?.unidadId}>
          <Select name="unidadId" value={unidadId} onChange={(e) => setUnidadId(e.target.value)}>
            <option value="">Elige…</option>
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>
                {u.sugerida ? "★ " : ""}
                {u.numero} · debe {pesos(u.deuda)}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo etiqueta="Monto de este pago" error={estado.errores?.monto}>
          <Input name="monto" inputMode="numeric" value={monto} onChange={(e) => setMonto(e.target.value)} />
        </Campo>
      </div>
      {montoNum > restante && <p className="text-sm text-peligro">El movimiento solo tiene {pesos(restante)} sin conciliar.</p>}
      {montoNum > 0 && montoNum < restante && (
        <p className="text-sm text-texto-suave">Quedarán {pesos(restante - montoNum)} del movimiento por identificar (por ejemplo, el pago de otra unidad).</p>
      )}
      {elegida && montoNum > 0 && <DistribucionPago avisos={elegida.avisos} monto={montoNum} />}
      {estado.duplicado && (
        <div role="alert" className="rounded-xl border border-alerta/40 bg-alerta-suave p-3 text-sm">
          <p className="mb-2">{estado.duplicado}</p>
          <label className="flex items-center gap-2 font-semibold">
            <input type="checkbox" checked={duplicadoOk} onChange={(e) => setDuplicadoOk(e.target.checked)} className="h-5 w-5" />
            Son pagos distintos: registrar de todas formas
          </label>
        </div>
      )}
      {duplicadoOk && <input type="hidden" name="permitirDuplicado" value="1" />}
      <Mensaje texto={estado.mensaje} />
      <Boton type="submit" disabled={pendiente || !unidadId || montoNum <= 0 || montoNum > restante || (!!estado.duplicado && !duplicadoOk)}>
        {pendiente ? "Registrando…" : "Registrar pago conciliado"}
      </Boton>
    </form>
  );
}

export function FormularioOtroIngreso({ accion, restante }: { accion: (e: EstadoForm, f: FormData) => Promise<EstadoForm>; restante: number }) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  if (estado.ok) return <Mensaje tipo="ok" texto={estado.mensaje} />;
  return (
    <form action={enviar} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <Campo etiqueta="Concepto">
          <Input name="concepto" maxLength={200} placeholder="Ej: arriendo de antena, intereses del banco" />
        </Campo>
        <Campo etiqueta="Monto">
          <Input name="monto" inputMode="numeric" defaultValue={String(Math.round(restante))} />
        </Campo>
      </div>
      <Mensaje texto={estado.mensaje} />
      <Boton type="submit" variante="secundario" disabled={pendiente}>
        {pendiente ? "Guardando…" : "Registrar otro ingreso"}
      </Boton>
    </form>
  );
}
