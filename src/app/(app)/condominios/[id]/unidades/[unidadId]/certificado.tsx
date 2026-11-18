"use client";

// PILOTO-001 · Botón para emitir el certificado de unidad al día. Convive valida la deuda vencida.

import { useActionState } from "react";
import { Boton, Mensaje } from "@/components/ui";
import type { EstadoForm } from "@/lib/forms";

export function EmitirCertificado({ accion, alDia }: { accion: (e: EstadoForm, f: FormData) => Promise<EstadoForm>; alDia: boolean }) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  return (
    <form action={enviar} className="space-y-2">
      <Mensaje texto={estado.mensaje} tipo={estado.ok ? "ok" : "error"} />
      <Boton type="submit" variante={alDia ? "primario" : "secundario"} disabled={pendiente}>
        {pendiente ? "Revisando la cuenta…" : "Emitir certificado de unidad al día"}
      </Boton>
    </form>
  );
}
