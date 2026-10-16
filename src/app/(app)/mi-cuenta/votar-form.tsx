"use client";

import { useActionState } from "react";
import { Boton, Mensaje } from "@/components/ui";
import type { EstadoForm } from "@/lib/forms";

export function VotarForm({
  accion,
  opciones,
  nombre,
}: {
  accion: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>;
  opciones: { id: string; texto: string }[];
  nombre: string;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  if (estado.ok) return <Mensaje texto={estado.mensaje} tipo="ok" />;
  return (
    <form
      action={enviar}
      onSubmit={(ev) => {
        if (!confirm("¿Confirmas tu voto? No se puede cambiar después.")) ev.preventDefault();
      }}
      className="space-y-3"
    >
      <fieldset className="space-y-2">
        <legend className="sr-only">{nombre}</legend>
        {opciones.map((o) => (
          <label key={o.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 hover:bg-gray-50">
            <input type="radio" name="opcionId" value={o.id} required className="h-4 w-4 accent-emerald-600" />
            {o.texto}
          </label>
        ))}
      </fieldset>
      <div className="flex items-center gap-3">
        <Boton type="submit" disabled={pendiente}>
          {pendiente ? "Enviando…" : "Votar"}
        </Boton>
        <Mensaje texto={estado.mensaje} />
      </div>
    </form>
  );
}
