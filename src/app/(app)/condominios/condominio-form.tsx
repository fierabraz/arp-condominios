"use client";

import { useActionState } from "react";
import { Boton, Campo, Input, Mensaje } from "@/components/ui";
import type { EstadoForm } from "@/lib/forms";

type Valores = {
  nombre?: string;
  direccion?: string;
  comuna?: string | null;
  rut?: string | null;
  porcentajeReserva?: string;
  tasaInteresMora?: string;
  diaVencimiento?: number;
  totalUnidades?: number | null;
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
      <Campo etiqueta="Dirección" error={e.direccion}>
        <Input name="direccion" defaultValue={valores.direccion} required />
      </Campo>
      <Campo etiqueta="RUT de la comunidad" error={e.rut}>
        <Input name="rut" defaultValue={valores.rut ?? ""} placeholder="65.051.145-K" />
      </Campo>
      <Campo etiqueta="Fondo de reserva (% del gasto común)" error={e.porcentajeReserva}>
        <Input name="porcentajeReserva" inputMode="decimal" defaultValue={valores.porcentajeReserva ?? "5"} />
      </Campo>
      <Campo etiqueta="Interés por mora (% mensual)" error={e.tasaInteresMora}>
        <Input name="tasaInteresMora" inputMode="decimal" defaultValue={valores.tasaInteresMora ?? "0"} />
      </Campo>
      <Campo etiqueta="Día de vencimiento del cobro" error={e.diaVencimiento}>
        <Input name="diaVencimiento" type="number" min={1} max={28} defaultValue={valores.diaVencimiento ?? 10} />
      </Campo>
      <Campo etiqueta="Cantidad total de unidades" error={e.totalUnidades}>
        <Input
          name="totalUnidades"
          type="number"
          min={1}
          max={10000}
          defaultValue={valores.totalUnidades ?? ""}
          placeholder="Ej. 100"
          aria-describedby="ayuda-total-unidades"
        />
        <span id="ayuda-total-unidades" className="mt-1 block text-xs text-texto-suave">
          Departamentos, casas, locales, estacionamientos y bodegas con alícuota propia. Sirve para seguir el avance mientras las
          cargas.
        </span>
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
