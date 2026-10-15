"use client";

import { useActionState } from "react";
import { Boton, Campo, Input, Mensaje, Select } from "@/components/ui";
import { MESES } from "@/lib/cobro";
import type { EstadoForm } from "@/lib/forms";

export function PeriodoForm({
  accion,
  anio,
  mes,
}: {
  accion: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>;
  anio: number;
  mes: number;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  const e = estado.errores ?? {};
  return (
    <form action={enviar} className="grid items-start gap-4 sm:grid-cols-4">
      <Campo etiqueta="Mes" error={e.mes}>
        <Select name="mes" defaultValue={mes}>
          {MESES.map((m, i) => (
            <option key={m} value={i + 1}>
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </option>
          ))}
        </Select>
      </Campo>
      <Campo etiqueta="Año" error={e.anio}>
        <Input name="anio" type="number" defaultValue={anio} />
      </Campo>
      <div className="pt-6">
        <Boton type="submit" disabled={pendiente} className="w-full">
          Abrir período
        </Boton>
      </div>
      <div className="sm:col-span-4">
        <Mensaje texto={estado.mensaje} />
      </div>
    </form>
  );
}
