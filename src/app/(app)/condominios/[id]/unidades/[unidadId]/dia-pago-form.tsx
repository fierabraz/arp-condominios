"use client";

import { useActionState } from "react";
import { Boton, Campo, Mensaje, Select } from "@/components/ui";
import type { EstadoForm } from "@/lib/forms";
import { DIA_PAGO_MAX, DIA_PAGO_MIN } from "@/lib/cobro";

const DIAS = Array.from({ length: DIA_PAGO_MAX - DIA_PAGO_MIN + 1 }, (_, i) => DIA_PAGO_MIN + i);

/** Día del mes en que vence el cobro de la unidad. Vacío: el de la propiedad. */
export function DiaPagoForm({
  accion,
  diaPago,
  diaPropiedad,
  editable,
}: {
  accion: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>;
  diaPago: number | null;
  diaPropiedad: number;
  editable: boolean;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  const e = estado.errores ?? {};
  return (
    // key: al guardar, React limpia el formulario; con la key vuelve a mostrar el día guardado.
    <form key={diaPago ?? "general"} action={enviar} className="grid items-start gap-4 sm:grid-cols-[minmax(0,18rem)_auto]">
      <Campo etiqueta="Vence el día" error={e.diaPago}>
        <Select name="diaPago" defaultValue={diaPago ?? ""} disabled={!editable}>
          <option value="">Igual que la propiedad (día {diaPropiedad})</option>
          {DIAS.map((d) => (
            <option key={d} value={d}>
              Día {d}
              {d >= 29 ? " (o el último día del mes)" : ""}
            </option>
          ))}
        </Select>
      </Campo>
      {editable && (
        <div className="sm:pt-6">
          <Boton type="submit" disabled={pendiente}>
            {pendiente ? "Guardando…" : "Guardar día de pago"}
          </Boton>
        </div>
      )}
      <div className="sm:col-span-2">
        <Mensaje texto={estado.mensaje} tipo={estado.ok ? "ok" : "error"} />
      </div>
    </form>
  );
}
