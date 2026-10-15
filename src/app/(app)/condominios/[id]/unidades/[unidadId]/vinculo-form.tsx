"use client";

import { useActionState } from "react";
import { Boton, Campo, Mensaje, Select } from "@/components/ui";
import type { EstadoForm } from "@/lib/forms";

export function VinculoForm({
  accion,
  personas,
}: {
  accion: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>;
  personas: { id: string; nombre: string }[];
}) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  const e = estado.errores ?? {};
  return (
    <form action={enviar} className="grid items-start gap-4 sm:grid-cols-3">
      <Campo etiqueta="Persona" error={e.personaId}>
        <Select name="personaId" defaultValue="">
          <option value="" disabled>
            Elige…
          </option>
          {personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </Select>
      </Campo>
      <Campo etiqueta="Relación" error={e.relacion}>
        <Select name="relacion" defaultValue="PROPIETARIO">
          <option value="PROPIETARIO">Propietario</option>
          <option value="RESIDENTE">Residente</option>
        </Select>
      </Campo>
      <div className="pt-6">
        <Boton type="submit" disabled={pendiente} className="w-full">
          Vincular
        </Boton>
      </div>
      <div className="sm:col-span-3">
        <Mensaje texto={estado.mensaje} tipo={estado.ok ? "ok" : "error"} />
      </div>
    </form>
  );
}
