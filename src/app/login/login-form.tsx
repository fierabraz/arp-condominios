"use client";

import { useActionState } from "react";
import { Boton, Campo, Input, Mensaje } from "@/components/ui";
import type { EstadoForm } from "@/lib/forms";

export function LoginForm({
  accion,
  volver,
}: {
  accion: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>;
  volver?: string | null;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  return (
    <form action={enviar} className="space-y-4">
      {volver && <input type="hidden" name="volver" value={volver} />}
      <Campo etiqueta="Correo" error={estado.errores?.correo}>
        <Input name="correo" type="email" autoComplete="email" required />
      </Campo>
      <Campo etiqueta="Contraseña" error={estado.errores?.clave}>
        <Input name="clave" type="password" autoComplete="current-password" required />
      </Campo>
      <Mensaje texto={estado.mensaje} />
      <Boton type="submit" disabled={pendiente} className="w-full">
        {pendiente ? "Ingresando…" : "Ingresar"}
      </Boton>
    </form>
  );
}
