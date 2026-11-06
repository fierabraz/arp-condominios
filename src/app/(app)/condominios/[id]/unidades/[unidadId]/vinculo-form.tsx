"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Boton, Campo, Input, Mensaje, Select } from "@/components/ui";
import type { EstadoForm } from "@/lib/forms";
import { ORDEN_TIPOS, TIPOS_VINCULO, type TipoVinculo } from "@/lib/vinculos";

export function VinculoForm({
  accion,
  personas,
  hoy,
}: {
  accion: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>;
  personas: { id: string; nombre: string }[];
  hoy: string;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  const [tipo, setTipo] = useState<TipoVinculo>("PROPIETARIO");
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado.ok) form.current?.reset();
  }, [estado]);
  const e = estado.errores ?? {};
  const conTermino = tipo === "ARRENDATARIO" || tipo === "OCUPANTE";
  return (
    <form ref={form} action={enviar} className="grid items-start gap-4 sm:grid-cols-2">
      <Campo etiqueta="Persona" error={e.personaId}>
        <Select name="personaId" defaultValue="" required>
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
      <Campo etiqueta="Vínculo" error={e.tipo}>
        <Select name="tipo" value={tipo} onChange={(ev) => setTipo(ev.target.value as TipoVinculo)} aria-describedby="ayuda-vinculo">
          {ORDEN_TIPOS.map((t) => (
            <option key={t} value={t}>
              {TIPOS_VINCULO[t].texto}
            </option>
          ))}
        </Select>
        <span id="ayuda-vinculo" className="mt-1 block text-xs text-texto-suave">
          {TIPOS_VINCULO[tipo].ayuda}
        </span>
      </Campo>
      <Campo etiqueta="Desde" error={e.desde}>
        <Input name="desde" type="date" defaultValue={hoy} max={hoy} required />
      </Campo>
      {conTermino ? (
        <Campo etiqueta="Término previsto (opcional)" error={e.terminoPrevisto}>
          <Input name="terminoPrevisto" type="date" aria-describedby="ayuda-termino" />
          <span id="ayuda-termino" className="mt-1 block text-xs text-texto-suave">
            Solo como recordatorio: el vínculo sigue vigente hasta que lo termines.
          </span>
        </Campo>
      ) : (
        <span aria-hidden="true" className="hidden sm:block" />
      )}
      <Campo etiqueta="Respaldo (opcional)" error={e.respaldo}>
        <Input name="respaldo" placeholder="Escritura, contrato de arriendo…" />
      </Campo>
      <Campo etiqueta="Observaciones (opcional)" error={e.observaciones}>
        <Input name="observaciones" />
      </Campo>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Boton type="submit" disabled={pendiente}>
          {pendiente ? "Guardando…" : "Vincular"}
        </Boton>
        <Mensaje texto={estado.mensaje} tipo={estado.ok ? "ok" : "error"} />
      </div>
    </form>
  );
}
