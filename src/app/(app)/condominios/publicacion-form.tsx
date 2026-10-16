"use client";

import { useActionState } from "react";
import { Boton, Campo, Input, Mensaje } from "@/components/ui";
import type { EstadoForm } from "@/lib/forms";

export function PublicacionForm({
  accion,
  valores = {},
  textoBoton,
}: {
  accion: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>;
  valores?: { titulo?: string; contenido?: string };
  textoBoton: string;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  const e = estado.errores ?? {};
  return (
    <form action={enviar} className="grid gap-4">
      <Campo etiqueta="Título" error={e.titulo}>
        <Input name="titulo" defaultValue={valores.titulo} maxLength={150} required />
      </Campo>
      <Campo etiqueta="Contenido" error={e.contenido}>
        <textarea
          name="contenido"
          defaultValue={valores.contenido}
          rows={10}
          required
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </Campo>
      <div className="flex items-center gap-3">
        <Boton type="submit" disabled={pendiente}>
          {pendiente ? "Publicando…" : textoBoton}
        </Boton>
        <Mensaje texto={estado.mensaje} />
      </div>
    </form>
  );
}
