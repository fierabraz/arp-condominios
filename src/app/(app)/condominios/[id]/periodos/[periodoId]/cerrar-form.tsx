"use client";

import { useActionState } from "react";
import { Boton, Mensaje } from "@/components/ui";
import type { EstadoForm } from "@/lib/forms";

export function CerrarForm({
  accion,
  periodo,
}: {
  accion: (estado: EstadoForm) => Promise<EstadoForm>;
  periodo: string;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  return (
    <form
      action={enviar}
      onSubmit={(ev) => {
        if (!confirm(`¿Cerrar ${periodo} y emitir los avisos de cobro? Después no podrás cambiar los gastos.`)) {
          ev.preventDefault();
        }
      }}
      className="flex flex-wrap items-center gap-3"
    >
      <Boton type="submit" disabled={pendiente}>
        {pendiente ? "Emitiendo…" : "Cerrar período y emitir cobros"}
      </Boton>
      <Mensaje texto={estado.mensaje} tipo={estado.ok ? "ok" : "error"} />
    </form>
  );
}
