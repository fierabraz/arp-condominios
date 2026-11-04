"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Boton, Campo, Input, Mensaje, Select } from "@/components/ui";
import type { EstadoForm } from "@/lib/forms";

type Accion = (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>;

export function DatosForm({
  accion,
  inicial,
  roles,
  condominios,
}: {
  accion: Accion;
  inicial: { nombre: string; correo: string; rol: string; condominioId: string | null };
  roles: { valor: string; texto: string }[];
  condominios: { id: string; nombre: string }[];
}) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  const [rol, setRol] = useState(inicial.rol);
  const e = estado.errores ?? {};
  return (
    <form action={enviar} className="grid max-w-md gap-4">
      <Campo etiqueta="Nombre" error={e.nombre}>
        <Input name="nombre" defaultValue={inicial.nombre} required />
      </Campo>
      <Campo etiqueta="Correo (con este ingresa)" error={e.correo}>
        <Input name="correo" type="email" defaultValue={inicial.correo} required />
      </Campo>
      {roles.length > 1 && (
        <Campo etiqueta="Rol" error={e.rol}>
          <Select name="rol" value={rol} onChange={(ev) => setRol(ev.target.value)}>
            {roles.map((r) => (
              <option key={r.valor} value={r.valor}>
                {r.texto}
              </option>
            ))}
          </Select>
        </Campo>
      )}
      {rol === "COMITE" && (
        <Campo etiqueta="Propiedad que ve el comité" error={e.condominioId}>
          <Select name="condominioId" defaultValue={inicial.condominioId ?? ""}>
            <option value="">Elige una propiedad</option>
            {condominios.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Select>
        </Campo>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Boton type="submit" disabled={pendiente}>
          {pendiente ? "Guardando…" : "Guardar datos"}
        </Boton>
        <Mensaje texto={estado.mensaje} tipo={estado.ok ? "ok" : "error"} />
      </div>
    </form>
  );
}

export function ClaveForm({ accion }: { accion: Accion }) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado.ok) form.current?.reset();
  }, [estado]);
  const e = estado.errores ?? {};
  return (
    <form ref={form} action={enviar} className="grid max-w-md gap-4">
      <Campo etiqueta="Contraseña nueva (mínimo 8 caracteres)" error={e.nueva}>
        <Input name="nueva" type="password" autoComplete="new-password" minLength={8} required />
      </Campo>
      <Campo etiqueta="Repite la contraseña" error={e.repetir}>
        <Input name="repetir" type="password" autoComplete="new-password" required />
      </Campo>
      <div className="flex flex-wrap items-center gap-3">
        <Boton type="submit" disabled={pendiente}>
          {pendiente ? "Guardando…" : "Cambiar contraseña"}
        </Boton>
        <Mensaje texto={estado.mensaje} tipo={estado.ok ? "ok" : "error"} />
      </div>
    </form>
  );
}
