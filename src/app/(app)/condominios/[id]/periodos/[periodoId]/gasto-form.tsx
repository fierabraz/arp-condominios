"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Boton, Campo, Input, Mensaje, Select } from "@/components/ui";
import { CATEGORIAS_GASTO } from "@/lib/formato";
import type { EstadoForm } from "@/lib/forms";

export function GastoForm({
  accion,
  unidades,
  fecha,
}: {
  accion: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>;
  unidades: { id: string; numero: string }[];
  fecha: string;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  const [tipo, setTipo] = useState("COMUN");
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    // El tipo queda elegido para cargar varios gastos del mismo tipo seguidos.
    if (estado.ok) form.current?.reset();
  }, [estado]);
  const e = estado.errores ?? {};
  return (
    <form ref={form} action={enviar} className="grid items-start gap-4 sm:grid-cols-3">
      <Campo etiqueta="Tipo" error={e.tipo}>
        <Select name="tipo" value={tipo} onChange={(ev) => setTipo(ev.target.value)}>
          <option value="COMUN">Común (se reparte por alícuota)</option>
          <option value="INDIVIDUAL">Individual (a una unidad)</option>
        </Select>
      </Campo>
      {tipo === "INDIVIDUAL" ? (
        <Campo etiqueta="Unidad" error={e.unidadId}>
          <Select name="unidadId" defaultValue="">
            <option value="" disabled>
              Elige…
            </option>
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>
                {u.numero}
              </option>
            ))}
          </Select>
        </Campo>
      ) : (
        <div className="hidden sm:block" />
      )}
      <Campo etiqueta="Categoría" error={e.categoria}>
        <Select name="categoria" defaultValue="">
          <option value="" disabled>
            Elige…
          </option>
          {CATEGORIAS_GASTO.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
      </Campo>
      <div className="sm:col-span-2">
        <Campo etiqueta="Descripción" error={e.descripcion}>
          <Input name="descripcion" placeholder="Cuenta de luz áreas comunes" required />
        </Campo>
      </div>
      <Campo etiqueta="Monto" error={e.monto}>
        <Input name="monto" inputMode="decimal" placeholder="150.000" required />
      </Campo>
      <Campo etiqueta="Proveedor" error={e.proveedor}>
        <Input name="proveedor" />
      </Campo>
      <Campo etiqueta="N° boleta o factura" error={e.documento}>
        <Input name="documento" />
      </Campo>
      <Campo etiqueta="Fecha" error={e.fecha}>
        <Input name="fecha" type="date" defaultValue={fecha} required />
      </Campo>
      <div className="flex items-center gap-3 sm:col-span-3">
        <Boton type="submit" disabled={pendiente}>
          {pendiente ? "Guardando…" : "Registrar gasto"}
        </Boton>
        <Mensaje texto={estado.mensaje} tipo={estado.ok ? "ok" : "error"} />
      </div>
    </form>
  );
}
