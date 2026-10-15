"use client";

import { useActionState, useEffect, useRef } from "react";
import { Boton, Campo, Input, Mensaje, Select } from "@/components/ui";
import { ETIQUETAS_MEDIO_PAGO } from "@/lib/formato";
import type { EstadoForm } from "@/lib/forms";

export function PagoForm({
  accion,
  unidades,
  fecha,
}: {
  accion: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>;
  unidades: { id: string; numero: string; deuda: string }[];
  fecha: string;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado.ok) form.current?.reset();
  }, [estado]);
  const e = estado.errores ?? {};
  return (
    <form ref={form} action={enviar} className="grid items-start gap-4 sm:grid-cols-3">
      <Campo etiqueta="Unidad" error={e.unidadId}>
        <Select name="unidadId" defaultValue="">
          <option value="" disabled>
            Elige…
          </option>
          {unidades.map((u) => (
            <option key={u.id} value={u.id}>
              {u.numero} · debe {u.deuda}
            </option>
          ))}
        </Select>
      </Campo>
      <Campo etiqueta="Monto" error={e.monto}>
        <Input name="monto" inputMode="decimal" placeholder="85.000" required />
      </Campo>
      <Campo etiqueta="Fecha" error={e.fecha}>
        <Input name="fecha" type="date" defaultValue={fecha} required />
      </Campo>
      <Campo etiqueta="Medio" error={e.medio}>
        <Select name="medio" defaultValue="TRANSFERENCIA">
          {Object.entries(ETIQUETAS_MEDIO_PAGO).map(([valor, texto]) => (
            <option key={valor} value={valor}>
              {texto}
            </option>
          ))}
        </Select>
      </Campo>
      <div className="sm:col-span-2">
        <Campo etiqueta="Referencia (n° de operación, comprobante)" error={e.referencia}>
          <Input name="referencia" />
        </Campo>
      </div>
      <div className="flex items-center gap-3 sm:col-span-3">
        <Boton type="submit" disabled={pendiente}>
          {pendiente ? "Registrando…" : "Registrar pago"}
        </Boton>
        <Mensaje texto={estado.mensaje} tipo={estado.ok ? "ok" : "error"} />
      </div>
    </form>
  );
}
