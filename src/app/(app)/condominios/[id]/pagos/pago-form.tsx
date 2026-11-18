"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { DistribucionPago, type AvisoParaDistribuir } from "@/components/distribucion-pago";
import { Boton, Campo, Input, Mensaje, Select } from "@/components/ui";
import { ETIQUETAS_MEDIO_PAGO } from "@/lib/formato";
import type { EstadoForm } from "@/lib/forms";

export function PagoForm({
  accion,
  unidades,
  fecha,
}: {
  accion: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>;
  unidades: { id: string; numero: string; deuda: string; avisos: AvisoParaDistribuir[] }[];
  fecha: string;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado.ok) form.current?.reset();
  }, [estado]);
  const e = estado.errores ?? {};
  // SEG-22: si ya hay un pago igual, el formulario vuelve con lo escrito y pide confirmar.
  const v = estado.valores ?? {};
  const duplicado = v.duplicado === "si";
  // FIN-COMP A: para mostrar qué avisos paga (propuesta editable).
  const [unidadId, setUnidadId] = useState(v.unidadId ?? "");
  const [monto, setMonto] = useState(v.monto ?? "");
  const [visto, setVisto] = useState(estado);
  if (visto !== estado) {
    setVisto(estado);
    if (estado.ok) {
      setUnidadId("");
      setMonto("");
    } else if (estado.valores) {
      setUnidadId(estado.valores.unidadId ?? "");
      setMonto(estado.valores.monto ?? "");
    }
  }
  const elegida = unidades.find((u) => u.id === unidadId);
  const montoNum = Number(monto.replace(/\./g, "").replace(",", ".")) || 0;
  return (
    <form ref={form} action={enviar} key={JSON.stringify(v)} className="grid items-start gap-4 sm:grid-cols-3">
      <Campo etiqueta="Unidad" error={e.unidadId}>
        <Select name="unidadId" value={unidadId} onChange={(ev) => setUnidadId(ev.target.value)}>
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
        <Input name="monto" inputMode="decimal" placeholder="85.000" value={monto} onChange={(ev) => setMonto(ev.target.value)} required />
      </Campo>
      <Campo etiqueta="Fecha" error={e.fecha}>
        <Input name="fecha" type="date" defaultValue={v.fecha ?? fecha} required />
      </Campo>
      <Campo etiqueta="Medio" error={e.medio}>
        <Select name="medio" defaultValue={v.medio ?? "TRANSFERENCIA"}>
          {Object.entries(ETIQUETAS_MEDIO_PAGO).map(([valor, texto]) => (
            <option key={valor} value={valor}>
              {texto}
            </option>
          ))}
        </Select>
      </Campo>
      <div className="sm:col-span-2">
        <Campo etiqueta="Referencia (n° de operación, comprobante)" error={e.referencia}>
          <Input name="referencia" defaultValue={v.referencia} />
        </Campo>
      </div>
      {elegida && montoNum > 0 && (
        <div className="sm:col-span-3">
          <DistribucionPago avisos={elegida.avisos} monto={montoNum} />
        </div>
      )}
      {e.distribucion && <p className="text-sm text-peligro sm:col-span-3">{e.distribucion[0]}</p>}
      {duplicado && (
        <label className="flex items-start gap-2 rounded-lg border border-alerta/40 bg-alerta-suave p-3 text-sm text-alerta sm:col-span-3">
          <input type="checkbox" name="confirmarDuplicado" value="si" required className="mt-0.5" />
          <span>Revisé y es otro pago distinto (no lo estoy registrando dos veces).</span>
        </label>
      )}
      <div className="flex items-center gap-3 sm:col-span-3">
        <Boton type="submit" disabled={pendiente}>
          {pendiente ? "Registrando…" : "Registrar pago"}
        </Boton>
        <Mensaje texto={estado.mensaje} tipo={estado.ok ? "ok" : "error"} />
      </div>
    </form>
  );
}
