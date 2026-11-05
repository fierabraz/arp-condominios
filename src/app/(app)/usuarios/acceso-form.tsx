"use client";

import { useActionState } from "react";
import { Boton, Mensaje } from "@/components/ui";
import type { EstadoForm } from "@/lib/forms";
import { SelectorAcceso } from "./selector-acceso";

/** Cambiar qué propiedades ve un administrador que ya tiene cuenta. */
export function AccesoForm({
  accion,
  condominios,
  todas,
  asignados,
}: {
  accion: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>;
  condominios: { id: string; nombre: string }[];
  todas: boolean;
  asignados: string[];
}) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  return (
    <details className="text-left">
      <summary className="cursor-pointer list-none text-sm font-semibold text-marca hover:underline">Cambiar acceso</summary>
      <form action={enviar} className="mt-3 grid gap-3">
        <SelectorAcceso condominios={condominios} todas={todas} asignados={asignados} />
        <div className="flex flex-wrap items-center gap-3">
          <Boton type="submit" disabled={pendiente}>
            {pendiente ? "Guardando…" : "Guardar acceso"}
          </Boton>
          <Mensaje texto={estado.mensaje} tipo={estado.ok ? "ok" : "error"} />
        </div>
      </form>
    </details>
  );
}
