"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Boton, Campo, Input, Mensaje, Select } from "@/components/ui";
import type { EstadoForm } from "@/lib/forms";

type Opcion = { id: string; nombre: string };

export function UsuarioForm({
  accion,
  condominios,
  personas,
}: {
  accion: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>;
  condominios: Opcion[];
  personas: Opcion[];
}) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  const [rol, setRol] = useState("ADMINISTRADOR");
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    // El rol queda elegido para crear varias cuentas del mismo tipo seguidas.
    if (estado.ok) form.current?.reset();
  }, [estado]);
  const e = estado.errores ?? {};
  return (
    <form ref={form} action={enviar} className="grid items-start gap-4 sm:grid-cols-2">
      <Campo etiqueta="Nombre" error={e.nombre}>
        <Input name="nombre" required />
      </Campo>
      <Campo etiqueta="Correo" error={e.correo}>
        <Input name="correo" type="email" required />
      </Campo>
      <Campo etiqueta="Contraseña inicial" error={e.clave}>
        <Input name="clave" type="text" minLength={8} required />
      </Campo>
      <Campo etiqueta="Rol" error={e.rol}>
        <Select name="rol" value={rol} onChange={(ev) => setRol(ev.target.value)}>
          <option value="ADMINISTRADOR">Administrador</option>
          <option value="COMITE">Comité (solo lectura)</option>
          <option value="RESIDENTE">Residente</option>
        </Select>
      </Campo>
      {rol === "COMITE" && (
        <Campo etiqueta="Condominio" error={e.condominioId}>
          <Select name="condominioId" defaultValue="">
            <option value="" disabled>
              Elige…
            </option>
            {condominios.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Select>
        </Campo>
      )}
      {rol === "RESIDENTE" && (
        <Campo etiqueta="Persona" error={e.personaId}>
          <Select name="personaId" defaultValue="">
            <option value="" disabled>
              Elige…
            </option>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Select>
        </Campo>
      )}
      <div className="flex items-center gap-3 sm:col-span-2">
        <Boton type="submit" disabled={pendiente}>
          {pendiente ? "Creando…" : "Crear cuenta"}
        </Boton>
        <Mensaje texto={estado.mensaje} tipo={estado.ok ? "ok" : "error"} />
      </div>
    </form>
  );
}
