"use client";

import { useActionState } from "react";
import { Boton, Campo, Input, Mensaje } from "@/components/ui";
import type { EstadoForm } from "@/lib/forms";

export function DatosForm({
  accion,
  nombre,
  telefono,
}: {
  accion: (e: EstadoForm, f: FormData) => Promise<EstadoForm>;
  nombre: string;
  telefono: string | null;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  const e = estado.errores ?? {};
  return (
    <form action={enviar} className="grid gap-4 sm:grid-cols-2">
      <Campo etiqueta="Nombre y apellido" error={e.nombre}>
        <Input name="nombre" required defaultValue={nombre} autoComplete="name" />
      </Campo>
      <Campo etiqueta="Teléfono (opcional)" error={e.telefono}>
        <Input name="telefono" type="tel" defaultValue={telefono ?? ""} autoComplete="tel" />
      </Campo>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Boton type="submit" disabled={pendiente}>
          {pendiente ? "Guardando…" : "Guardar mis datos"}
        </Boton>
        <Mensaje texto={estado.mensaje} tipo={estado.ok ? "ok" : "error"} />
      </div>
    </form>
  );
}
