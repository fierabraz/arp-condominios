"use client";

import { useActionState } from "react";
import { Boton, Campo, Input, Mensaje } from "@/components/ui";
import type { EstadoForm } from "@/lib/forms";

type Valores = {
  nombre?: string;
  direccion?: string;
  comuna?: string | null;
  porcentajeReserva?: string;
  tasaInteresMora?: string;
  diaVencimiento?: number;
};

export function CondominioForm({
  accion,
  valores = {},
  textoBoton,
}: {
  accion: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>;
  valores?: Valores;
  textoBoton: string;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  const e = estado.errores ?? {};
  return (
    <form action={enviar} className="grid gap-4 sm:grid-cols-2">
      <Campo etiqueta="Nombre" error={e.nombre}>
        <Input name="nombre" defaultValue={valores.nombre} required />
      </Campo>
      <Campo etiqueta="Comuna o ciudad" error={e.comuna}>
        <Input name="comuna" defaultValue={valores.comuna ?? ""} />
      </Campo>
      <div className="sm:col-span-2">
        <Campo etiqueta="Dirección" error={e.direccion}>
          <Input name="direccion" defaultValue={valores.direccion} required />
        </Campo>
      </div>
      <Campo etiqueta="Fondo de reserva (% del gasto común)" error={e.porcentajeReserva}>
        <Input name="porcentajeReserva" inputMode="decimal" defaultValue={valores.porcentajeReserva ?? "5"} />
      </Campo>
      <Campo etiqueta="Interés por mora (% mensual)" error={e.tasaInteresMora}>
        <Input name="tasaInteresMora" inputMode="decimal" defaultValue={valores.tasaInteresMora ?? "0"} />
      </Campo>
      <Campo etiqueta="Día de vencimiento del cobro" error={e.diaVencimiento}>
        <Input name="diaVencimiento" type="number" min={1} max={28} defaultValue={valores.diaVencimiento ?? 10} />
      </Campo>
      <div className="flex items-end gap-3 sm:col-span-2">
        <Boton type="submit" disabled={pendiente}>
          {pendiente ? "Guardando…" : textoBoton}
        </Boton>
        <Mensaje texto={estado.mensaje} />
      </div>
    </form>
  );
}
