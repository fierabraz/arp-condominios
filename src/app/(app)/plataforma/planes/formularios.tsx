"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Boton, Campo, Input, Mensaje, Select } from "@/components/ui";
import type { EstadoForm } from "@/lib/forms";

type Accion = (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>;

export type PlanEditable = {
  nombre: string;
  descripcion: string | null;
  maxComunidades: number | null;
  orden: number;
  activo: boolean;
};

/** Crear o editar un plan. El cupo vacío significa "sin límite". */
export function PlanForm({ accion, inicial, textoBoton }: { accion: Accion; inicial?: PlanEditable; textoBoton: string }) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado.ok && !inicial) form.current?.reset();
  }, [estado, inicial]);
  const e = estado.errores ?? {};
  return (
    <form ref={form} action={enviar} className="grid items-start gap-4 sm:grid-cols-[2fr_1fr_3fr_6rem]">
      <Campo etiqueta="Nombre del plan" error={e.nombre}>
        <Input name="nombre" defaultValue={inicial?.nombre} required maxLength={60} />
      </Campo>
      <Campo etiqueta="Máx. comunidades" error={e.maxComunidades}>
        <Input name="maxComunidades" type="number" min={0} inputMode="numeric" placeholder="Sin límite" defaultValue={inicial?.maxComunidades ?? ""} />
      </Campo>
      <Campo etiqueta="Descripción (opcional)" error={e.descripcion}>
        <Input name="descripcion" defaultValue={inicial?.descripcion ?? ""} maxLength={300} />
      </Campo>
      <Campo etiqueta="Orden" error={e.orden}>
        <Input name="orden" type="number" min={0} defaultValue={inicial?.orden ?? 0} />
      </Campo>
      <div className="flex flex-wrap items-center gap-4 sm:col-span-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="activo" defaultChecked={inicial?.activo ?? true} className="h-4 w-4" />
          Se ofrece a administradoras nuevas
        </label>
        <Boton type="submit" disabled={pendiente}>
          {pendiente ? "Guardando…" : textoBoton}
        </Boton>
        <Mensaje texto={estado.mensaje} tipo={estado.ok ? "ok" : "error"} />
      </div>
    </form>
  );
}

/** Plan y facultad de crear comunidades de una administradora. */
export function PlanAdministradoraForm({
  accion,
  planes,
  inicial,
}: {
  accion: Accion;
  planes: { id: string; texto: string }[];
  inicial: { planId: string | null; creaComunidades: boolean };
}) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  // Controlados: así, después de guardar, se ve lo que quedó guardado (y no el valor inicial).
  const [planId, setPlanId] = useState(inicial.planId ?? "");
  const [crea, setCrea] = useState(inicial.creaComunidades);
  const e = estado.errores ?? {};
  return (
    <form action={enviar} className="grid max-w-md gap-4">
      <Campo etiqueta="Plan" error={e.planId}>
        <Select name="planId" value={planId} onChange={(ev) => setPlanId(ev.target.value)}>
          <option value="">Sin plan (sin límite)</option>
          {planes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.texto}
            </option>
          ))}
        </Select>
      </Campo>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="creaComunidades" checked={crea}
          onChange={(ev) => setCrea(ev.target.checked)} className="mt-0.5 h-4 w-4" />
        <span>
          <span className="font-semibold">Puede crear comunidades</span>
          <br />
          <span className="text-texto-suave">Si lo desmarcas, su administrador principal no puede crear nuevas, aunque le quede cupo.</span>
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Boton type="submit" disabled={pendiente}>
          {pendiente ? "Guardando…" : "Guardar plan"}
        </Boton>
        <Mensaje texto={estado.mensaje} tipo={estado.ok ? "ok" : "error"} />
      </div>
    </form>
  );
}
