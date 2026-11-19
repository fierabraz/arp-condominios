"use client";

import { useActionState } from "react";
import { Boton, Campo, Input, Mensaje, Select } from "@/components/ui";
import type { EstadoForm } from "@/lib/forms";
import { ORDEN_RELACIONES, RELACIONES } from "@/lib/cuentas-reglas";

export function SolicitudVinculoForm({ accion }: { accion: (e: EstadoForm, f: FormData) => Promise<EstadoForm> }) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  const e = estado.errores ?? {};
  const v = estado.valores ?? {};
  return (
    <form action={enviar} className="grid gap-4 sm:grid-cols-2">
      <Campo etiqueta="Código de la comunidad" error={e.codigo}>
        <Input name="codigo" required autoCapitalize="characters" placeholder="XXXX-XXXX" defaultValue={v.codigo} />
      </Campo>
      <Campo etiqueta="Tu unidad" error={e.unidad}>
        <Input name="unidad" required placeholder="Ej. Depto 302, Casa 14" defaultValue={v.unidad} />
      </Campo>
      <Campo etiqueta="Tu relación con la unidad" error={e.relacion}>
        <Select name="relacion" required defaultValue={v.relacion ?? ""}>
          <option value="" disabled>
            Elige…
          </option>
          {ORDEN_RELACIONES.map((r) => (
            <option key={r} value={r}>
              {RELACIONES[r].texto}
            </option>
          ))}
        </Select>
      </Campo>
      <Campo etiqueta="Mensaje para la administración (opcional)" error={e.mensaje}>
        <Input name="mensaje" maxLength={500} defaultValue={v.mensaje} />
      </Campo>
      <div className="space-y-2 sm:col-span-2">
        <Mensaje texto={estado.mensaje} tipo={estado.ok ? "ok" : "error"} />
        <Boton type="submit" disabled={pendiente}>
          {pendiente ? "Enviando…" : "Enviar solicitud"}
        </Boton>
      </div>
    </form>
  );
}
