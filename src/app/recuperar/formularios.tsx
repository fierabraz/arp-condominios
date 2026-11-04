"use client";

import { useActionState } from "react";
import { Boton, Campo, Input, Mensaje } from "@/components/ui";
import type { EstadoForm } from "@/lib/forms";

type Accion = (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>;

export function SolicitudForm({ accion }: { accion: Accion }) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  if (estado.ok) return <Mensaje texto={estado.mensaje} tipo="ok" />;
  return (
    <form action={enviar} className="space-y-4">
      <Campo etiqueta="Correo de tu cuenta" error={estado.errores?.correo}>
        <Input name="correo" type="email" autoComplete="email" required />
      </Campo>
      <Mensaje texto={estado.mensaje} />
      <Boton type="submit" disabled={pendiente} className="w-full">
        {pendiente ? "Enviando…" : "Enviarme el enlace"}
      </Boton>
    </form>
  );
}

export function ClaveNuevaForm({ accion }: { accion: Accion }) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  return (
    <form action={enviar} className="space-y-4">
      <Campo etiqueta="Contraseña nueva (mínimo 8 caracteres)" error={estado.errores?.nueva}>
        <Input name="nueva" type="password" autoComplete="new-password" required minLength={8} />
      </Campo>
      <Campo etiqueta="Repite la contraseña" error={estado.errores?.repetir}>
        <Input name="repetir" type="password" autoComplete="new-password" required />
      </Campo>
      <Mensaje texto={estado.mensaje} />
      <Boton type="submit" disabled={pendiente} className="w-full">
        {pendiente ? "Guardando…" : "Guardar contraseña"}
      </Boton>
    </form>
  );
}
