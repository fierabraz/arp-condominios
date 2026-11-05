"use client";

import { useActionState } from "react";
import { Boton, Campo, Input, Mensaje } from "@/components/ui";
import type { EstadoForm } from "@/lib/forms";

export function PruebaCorreoForm({
  accion,
  correo,
}: {
  accion: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>;
  correo: string;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  return (
    <form action={enviar} className="space-y-3">
      <Campo etiqueta="Enviar un correo de prueba a" error={estado.errores?.para}>
        <Input name="para" type="email" defaultValue={correo} required />
      </Campo>
      <Mensaje texto={estado.mensaje} tipo={estado.ok ? "ok" : "error"} />
      <Boton type="submit" disabled={pendiente}>
        {pendiente ? "Enviando..." : "Enviar correo de prueba"}
      </Boton>
    </form>
  );
}
