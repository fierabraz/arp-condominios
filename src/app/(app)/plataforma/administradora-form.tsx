"use client";

import { useActionState, useEffect, useRef } from "react";
import { Boton, Campo, Input, Mensaje } from "@/components/ui";
import type { EstadoForm } from "@/lib/forms";

export function AdministradoraForm({
  accion,
}: {
  accion: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado.ok) form.current?.reset();
  }, [estado]);
  const e = estado.errores ?? {};
  return (
    <form ref={form} action={enviar} className="grid items-start gap-4 sm:grid-cols-3">
      <Campo etiqueta="Nombre de la administradora" error={e.nombre}>
        <Input name="nombre" required />
      </Campo>
      <Campo etiqueta="País (código)" error={e.pais}>
        <Input name="pais" defaultValue="CL" maxLength={2} />
      </Campo>
      <Campo etiqueta="Moneda (código)" error={e.moneda}>
        <Input name="moneda" defaultValue="CLP" maxLength={3} />
      </Campo>
      <Campo etiqueta="Nombre del administrador" error={e.adminNombre}>
        <Input name="adminNombre" required />
      </Campo>
      <Campo etiqueta="Correo del administrador" error={e.adminCorreo}>
        <Input name="adminCorreo" type="email" required />
      </Campo>
      <Campo etiqueta="Contraseña inicial" error={e.adminClave}>
        <Input name="adminClave" type="text" minLength={8} required />
      </Campo>
      <div className="flex items-center gap-3 sm:col-span-3">
        <Boton type="submit" disabled={pendiente}>
          {pendiente ? "Creando…" : "Crear administradora"}
        </Boton>
        <Mensaje texto={estado.mensaje} tipo={estado.ok ? "ok" : "error"} />
      </div>
    </form>
  );
}
