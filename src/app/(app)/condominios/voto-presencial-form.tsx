"use client";

import { useActionState, useEffect, useRef } from "react";
import { Boton, Campo, Mensaje, Select } from "@/components/ui";
import type { EstadoForm } from "@/lib/forms";

export function VotoPresencialForm({
  accion,
  unidades,
  opciones,
}: {
  accion: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>;
  unidades: { id: string; numero: string }[];
  opciones: { id: string; texto: string }[];
}) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado.ok) form.current?.reset();
  }, [estado]);
  const e = estado.errores ?? {};
  return (
    <form ref={form} action={enviar} className="grid items-end gap-4 sm:grid-cols-[1fr_1fr_auto]">
      <Campo etiqueta="Unidad" error={e.unidadId}>
        <Select name="unidadId" defaultValue="">
          <option value="" disabled>
            Elige…
          </option>
          {unidades.map((u) => (
            <option key={u.id} value={u.id}>
              {u.numero}
            </option>
          ))}
        </Select>
      </Campo>
      <Campo etiqueta="Voto" error={e.opcionId}>
        <Select name="opcionId" defaultValue="">
          <option value="" disabled>
            Elige…
          </option>
          {opciones.map((o) => (
            <option key={o.id} value={o.id}>
              {o.texto}
            </option>
          ))}
        </Select>
      </Campo>
      <Boton type="submit" disabled={pendiente}>
        {pendiente ? "Guardando…" : "Registrar voto"}
      </Boton>
      <div className="sm:col-span-3">
        <Mensaje texto={estado.mensaje} tipo={estado.ok ? "ok" : "error"} />
      </div>
    </form>
  );
}
