"use client";

import { startTransition, useActionState, useState } from "react";
import { Plus, X } from "lucide-react";
import { Boton, Campo, Input, Mensaje, Select } from "@/components/ui";
import type { EstadoForm } from "@/lib/forms";

export function VotacionForm({
  accion,
  fechaMinima,
  fechaSugerida,
}: {
  accion: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>;
  fechaMinima: string;
  fechaSugerida: string;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  const [opciones, setOpciones] = useState([
    { id: 1, texto: "A favor" },
    { id: 2, texto: "En contra" },
    { id: 3, texto: "Abstención" },
  ]);
  const e = estado.errores ?? {};
  return (
    <form
      action={enviar}
      onSubmit={(ev) => {
        // Enviar sin que React limpie el formulario si hay errores de validación.
        ev.preventDefault();
        const datos = new FormData(ev.currentTarget);
        startTransition(() => enviar(datos));
      }}
      className="grid gap-4 sm:grid-cols-2"
    >
      <div className="sm:col-span-2">
        <Campo etiqueta="Nombre de la votación" error={e.titulo}>
          <Input name="titulo" placeholder="Ej.: Proyecto de cámaras de seguridad" required />
        </Campo>
      </div>
      <div className="sm:col-span-2">
        <Campo etiqueta="Descripción (opcional)" error={e.descripcion}>
          <textarea
            name="descripcion"
            rows={4}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-marca focus:outline-none focus:ring-1 focus:ring-marca"
            placeholder="Explica qué se vota, costos y plazos."
          />
        </Campo>
      </div>
      <Campo etiqueta="Fecha de término (vota hasta las 23:59)" error={e.cierra}>
        <Input name="cierra" type="date" min={fechaMinima} defaultValue={fechaSugerida} required />
      </Campo>
      <Campo etiqueta="Cómo se cuentan los votos" error={e.ponderacion}>
        <Select name="ponderacion" defaultValue="ALICUOTA">
          <option value="ALICUOTA">Según alícuota de cada unidad</option>
          <option value="UNIDAD">Una unidad, un voto</option>
        </Select>
      </Campo>
      <fieldset className="sm:col-span-2">
        <legend className="mb-1 text-sm font-medium text-texto">Opciones</legend>
        <div className="space-y-2">
          {opciones.map((o, i) => (
            <div key={o.id} className="flex items-center gap-2">
              <span className="w-5 text-right text-sm text-texto-suave">{i + 1}.</span>
              <Input
                name="opcion"
                aria-label={`Opción ${i + 1}`}
                value={o.texto}
                onChange={(ev) => setOpciones(opciones.map((x) => (x.id === o.id ? { ...x, texto: ev.target.value } : x)))}
              />
              {opciones.length > 2 && (
                <button
                  type="button"
                  onClick={() => setOpciones(opciones.filter((x) => x.id !== o.id))}
                  aria-label={`Quitar opción ${i + 1}`}
                  className="rounded p-1.5 text-texto-suave hover:bg-gray-100"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setOpciones([...opciones, { id: Math.max(...opciones.map((x) => x.id)) + 1, texto: "" }])}
          className="mt-2 inline-flex items-center gap-1 text-sm text-marca hover:underline"
        >
          <Plus size={15} /> Agregar opción
        </button>
        {e.opciones && <p className="mt-1 text-sm text-peligro">{e.opciones[0]}</p>}
      </fieldset>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Boton type="submit" disabled={pendiente}>
          {pendiente ? "Guardando…" : "Guardar votación"}
        </Boton>
        <span className="text-sm text-texto-suave">Queda en “Por publicar” hasta que la publiques.</span>
        <Mensaje texto={estado.mensaje} />
      </div>
    </form>
  );
}
