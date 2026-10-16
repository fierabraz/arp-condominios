"use client";

import { useActionState, useEffect, useRef } from "react";
import { Boton, Campo, Input, Mensaje } from "@/components/ui";
import type { EstadoForm } from "@/lib/forms";

export function ProveedorForm({ accion }: { accion: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm> }) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado.ok) form.current?.reset();
  }, [estado]);
  const e = estado.errores ?? {};
  return (
    <form ref={form} action={enviar} className="grid items-start gap-4 sm:grid-cols-3">
      <Campo etiqueta="Nombre o razón social" error={e.nombre}>
        <Input name="nombre" required />
      </Campo>
      <Campo etiqueta="RUT" error={e.rut}>
        <Input name="rut" />
      </Campo>
      <Campo etiqueta="Rubro" error={e.rubro}>
        <Input name="rubro" placeholder="Aseo, ascensores, jardinería…" />
      </Campo>
      <Campo etiqueta="Contacto" error={e.contacto}>
        <Input name="contacto" />
      </Campo>
      <Campo etiqueta="Teléfono" error={e.telefono}>
        <Input name="telefono" type="tel" />
      </Campo>
      <Campo etiqueta="Correo" error={e.correo}>
        <Input name="correo" type="email" />
      </Campo>
      <div className="flex items-center gap-3 sm:col-span-3">
        <Boton type="submit" disabled={pendiente}>
          {pendiente ? "Guardando…" : "Agregar proveedor"}
        </Boton>
        <Mensaje texto={estado.mensaje} tipo={estado.ok ? "ok" : "error"} />
      </div>
    </form>
  );
}
