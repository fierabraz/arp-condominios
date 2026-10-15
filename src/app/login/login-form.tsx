"use client";

import { useActionState } from "react";
import { iniciarSesion } from "./actions";
import { Boton, Campo, Input, Mensaje } from "@/components/ui";

export function LoginForm() {
  const [estado, accion, pendiente] = useActionState(iniciarSesion, {});
  return (
    <form action={accion} className="space-y-4">
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
