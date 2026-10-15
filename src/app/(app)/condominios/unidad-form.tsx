"use client";

import { useActionState, useEffect, useRef } from "react";
import { Boton, Campo, Input, Mensaje, Select } from "@/components/ui";
import { ETIQUETAS_TIPO_UNIDAD } from "@/lib/formato";
import type { EstadoForm } from "@/lib/forms";

type Valores = { numero?: string; tipo?: string; alicuota?: string };

export function UnidadForm({
  accion,
  valores = {},
  textoBoton,
  limpiarAlGuardar = false,
}: {
  accion: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>;
  valores?: Valores;
  textoBoton: string;
  limpiarAlGuardar?: boolean;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado.ok && limpiarAlGuardar) form.current?.reset();
  }, [estado, limpiarAlGuardar]);
  const e = estado.errores ?? {};
  return (
    <form ref={form} action={enviar} className="grid items-start gap-4 sm:grid-cols-4">
      <Campo etiqueta="Número" error={e.numero}>
        <Input name="numero" defaultValue={valores.numero} placeholder="101" required />
      </Campo>
      <Campo etiqueta="Tipo" error={e.tipo}>
        <Select name="tipo" defaultValue={valores.tipo ?? "DEPARTAMENTO"}>
          {Object.entries(ETIQUETAS_TIPO_UNIDAD).map(([valor, texto]) => (
            <option key={valor} value={valor}>
              {texto}
            </option>
          ))}
        </Select>
      </Campo>
      <Campo etiqueta="Alícuota (%)" error={e.alicuota}>
        <Input name="alicuota" inputMode="decimal" defaultValue={valores.alicuota} placeholder="1,25" required />
      </Campo>
      <div className="pt-6">
        <Boton type="submit" disabled={pendiente} className="w-full">
          {pendiente ? "Guardando…" : textoBoton}
        </Boton>
      </div>
      <div className="sm:col-span-4">
        <Mensaje texto={estado.mensaje} tipo={estado.ok ? "ok" : "error"} />
      </div>
    </form>
  );
}
