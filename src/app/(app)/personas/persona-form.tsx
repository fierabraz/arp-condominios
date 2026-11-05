"use client";

import { useActionState, useEffect, useRef } from "react";
import { Boton, Campo, Input, Mensaje } from "@/components/ui";
import type { EstadoForm } from "@/lib/forms";

type Valores = { nombre?: string; documento?: string | null; correo?: string | null; telefono?: string | null };

export function PersonaForm({
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
  // Si hubo que corregir algo, el formulario conserva lo escrito.
  const v = estado.valores ? { ...valores, ...estado.valores } : valores;
  return (
    <form ref={form} action={enviar} className="grid items-start gap-4 sm:grid-cols-2">
      <Campo etiqueta="Nombre completo" error={e.nombre}>
        <Input name="nombre" defaultValue={v.nombre} required />
      </Campo>
      <Campo etiqueta="RUT o documento" error={e.documento}>
        <Input name="documento" defaultValue={v.documento ?? ""} />
      </Campo>
      <Campo etiqueta="Correo" error={e.correo}>
        <Input name="correo" type="email" defaultValue={v.correo ?? ""} />
      </Campo>
      <Campo etiqueta="Teléfono" error={e.telefono}>
        <Input name="telefono" defaultValue={v.telefono ?? ""} />
      </Campo>
      {e.confirmarNombre && (
        <label className="flex items-start gap-2 rounded-xl bg-alerta-suave px-3 py-2 text-sm text-alerta sm:col-span-2">
          <input type="checkbox" name="confirmarNombre" className="mt-0.5 size-5" />
          <span>{e.confirmarNombre.join(" ")}</span>
        </label>
      )}
      <div className="flex items-center gap-3 sm:col-span-2">
        <Boton type="submit" disabled={pendiente}>
          {pendiente ? "Guardando…" : textoBoton}
        </Boton>
        <Mensaje texto={estado.mensaje} tipo={estado.ok ? "ok" : "error"} />
      </div>
    </form>
  );
}
