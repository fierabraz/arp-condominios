"use client";

import { useActionState, useEffect, useRef } from "react";
import { Boton, Campo, Input, Mensaje } from "@/components/ui";
import type { EstadoForm } from "@/lib/forms";

export function ClaveForm({ accion }: { accion: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm> }) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado.ok) form.current?.reset();
  }, [estado]);
  const e = estado.errores ?? {};
  return (
    <form ref={form} action={enviar} className="grid max-w-sm gap-4">
      <Campo etiqueta="Contraseña actual" error={e.actual}>
        <Input name="actual" type="password" autoComplete="current-password" required />
      </Campo>
      <Campo etiqueta="Nueva contraseña" error={e.nueva}>
        <Input name="nueva" type="password" autoComplete="new-password" minLength={8} required />
      </Campo>
      <Campo etiqueta="Repite la nueva contraseña" error={e.repetir}>
        <Input name="repetir" type="password" autoComplete="new-password" minLength={8} required />
      </Campo>
      <div className="flex items-center gap-3">
        <Boton type="submit" disabled={pendiente}>
          {pendiente ? "Guardando…" : "Cambiar contraseña"}
        </Boton>
        <Mensaje texto={estado.mensaje} tipo={estado.ok ? "ok" : "error"} />
      </div>
    </form>
  );
}
