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
  return (
    <form ref={form} action={enviar} className="grid items-start gap-4 sm:grid-cols-2">
      <Campo etiqueta="Nombre completo" error={e.nombre}>
        <Input name="nombre" defaultValue={valores.nombre} required />
      </Campo>
      <Campo etiqueta="RUT o documento" error={e.documento}>
        <Input name="documento" defaultValue={valores.documento ?? ""} />
      </Campo>
      <Campo etiqueta="Correo" error={e.correo}>
        <Input name="correo" type="email" defaultValue={valores.correo ?? ""} />
      </Campo>
      <Campo etiqueta="Teléfono" error={e.telefono}>
        <Input name="telefono" defaultValue={valores.telefono ?? ""} />
      </Campo>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Boton type="submit" disabled={pendiente}>
          {pendiente ? "Guardando…" : textoBoton}
        </Boton>
        <Mensaje texto={estado.mensaje} tipo={estado.ok ? "ok" : "error"} />
      </div>
    </form>
  );
}
