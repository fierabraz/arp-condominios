"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Boton, Campo, Input, Mensaje, Select } from "@/components/ui";
import { CATEGORIAS_GASTO } from "@/lib/formato";
import type { EstadoForm } from "@/lib/forms";

export function GastoForm({
  accion,
  unidades,
  fecha,
  proveedores = [],
  fondos = [],
}: {
  accion: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>;
  unidades: { id: string; numero: string }[];
  fecha: string;
  proveedores?: string[];
  fondos?: { id: string; nombre: string; saldo: string }[];
}) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  const [tipo, setTipo] = useState("COMUN");
  const [pagado, setPagado] = useState(false);
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
          <option value="COMUN">Común (se reparte por porcentaje de prorrateo)</option>
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
        <Input name="proveedor" list="lista-proveedores" autoComplete="off" />
        <datalist id="lista-proveedores">
          {proveedores.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </Campo>
      <Campo etiqueta="N° boleta o factura" error={e.documento}>
        <Input name="documento" />
      </Campo>
      <Campo etiqueta="Fecha" error={e.fecha}>
        <Input name="fecha" type="date" defaultValue={fecha} required />
      </Campo>
      {tipo === "COMUN" && fondos.length > 0 && (
        <Campo etiqueta="Se paga con" error={e.fondoId}>
          <Select name="fondoId" defaultValue="">
            <option value="">Gasto común del mes (se reparte)</option>
            {fondos.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nombre} (disponible {f.saldo}): no se reparte
              </option>
            ))}
          </Select>
        </Campo>
      )}
      {tipo === "COMUN" && (
        <div className="space-y-3 sm:col-span-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="pagado" value="1" checked={pagado} onChange={(ev) => setPagado(ev.target.checked)} className="h-5 w-5" />
            Ya está pagado al proveedor
          </label>
          {pagado && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Campo etiqueta="Fecha de pago" error={e.fechaPago}>
                <Input name="fechaPago" type="date" defaultValue={fecha} required />
              </Campo>
              <Campo etiqueta="Medio de pago" error={e.medioPago}>
                <Select name="medioPago" defaultValue="TRANSFERENCIA">
                  <option value="TRANSFERENCIA">Transferencia</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="OTRO">Otro</option>
                </Select>
              </Campo>
            </div>
          )}
        </div>
      )}
      <div className="flex items-center gap-3 sm:col-span-3">
        <Boton type="submit" disabled={pendiente}>
          {pendiente ? "Guardando…" : "Registrar gasto"}
        </Boton>
        <Mensaje texto={estado.mensaje} tipo={estado.ok ? "ok" : "error"} />
      </div>
    </form>
  );
}
