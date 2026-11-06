"use client";

import { useActionState, useState } from "react";
import { Building2, Home, LayoutGrid } from "lucide-react";
import { Boton, Campo, Input, Mensaje } from "@/components/ui";
import type { EstadoForm } from "@/lib/forms";
import { TIPOS_GENERADOR, type TipoGenerador } from "@/lib/generador";

const ICONOS = { CASAS: Home, EDIFICIOS: Building2, MIXTA: LayoutGrid };

/** «Nueva comunidad»: nombre, dirección y cómo está compuesta. Lo demás se responde en el generador. */
export function NuevaComunidad({ accion }: { accion: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm> }) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  const [tipo, setTipo] = useState<TipoGenerador | "">((estado.valores?.tipo as TipoGenerador) ?? "");
  const v = estado.valores ?? {};
  return (
    <form action={enviar} className="grid gap-5">
      <fieldset>
        <legend className="mb-1 text-base font-bold text-convive-oscuro">¿Cómo está compuesta la comunidad?</legend>
        <p className="mb-3 text-sm text-texto-suave">Elige una opción. Según tu elección, Convive te hará solo las preguntas que corresponden.</p>
        <div className="grid gap-3 md:grid-cols-3">
          {(Object.keys(TIPOS_GENERADOR) as TipoGenerador[]).map((t, i) => {
            const Icono = ICONOS[t];
            const activo = tipo === t;
            return (
              <label
                key={t}
                className={`flex cursor-pointer flex-col gap-3 rounded-2xl border p-4 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-convive ${
                  activo ? "border-marca bg-marca-suave ring-2 ring-marca/30" : "border-borde bg-white hover:border-convive"
                }`}
              >
                <input type="radio" name="tipo" value={t} checked={activo} onChange={() => setTipo(t)} className="sr-only" />
                <span className={`flex size-12 items-center justify-center rounded-xl ${activo ? "bg-marca text-white" : "bg-convive-suave text-marca"}`}>
                  <Icono className="size-6" />
                </span>
                <span>
                  <span className="block text-xs font-bold text-texto-suave">{String.fromCharCode(65 + i)}.</span>
                  <span className="block font-bold text-convive-oscuro">{TIPOS_GENERADOR[t].texto}</span>
                  <span className="block text-sm text-texto-suave">{TIPOS_GENERADOR[t].ayuda}</span>
                </span>
              </label>
            );
          })}
        </div>
        {estado.errores?.tipo && <p className="mt-2 text-sm text-peligro">{estado.errores.tipo.join(" ")}</p>}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Nombre de la comunidad" error={estado.errores?.nombre}>
          <Input name="nombre" required minLength={2} maxLength={120} defaultValue={v.nombre} placeholder="Ej.: Condominio Los Aromos" />
        </Campo>
        <Campo etiqueta="Dirección" error={estado.errores?.direccion}>
          <Input name="direccion" required minLength={3} maxLength={200} defaultValue={v.direccion} />
        </Campo>
        <Campo etiqueta="Comuna (opcional)" error={estado.errores?.comuna}>
          <Input name="comuna" maxLength={80} defaultValue={v.comuna} />
        </Campo>
        <fieldset>
          <legend className="mb-1 block text-sm font-semibold text-texto">¿Es nueva o ya funcionaba? (opcional)</legend>
          <div className="flex flex-wrap gap-3 pt-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="modalidad" value="NUEVA" defaultChecked={v.modalidad === "NUEVA"} /> Nueva
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="modalidad" value="EXISTENTE" defaultChecked={v.modalidad === "EXISTENTE"} /> Ya funcionaba
            </label>
          </div>
        </fieldset>
      </div>
      <Mensaje texto={estado.mensaje} />
      <div className="flex flex-wrap items-center gap-3">
        <Boton type="submit" disabled={pendiente || !tipo}>
          {pendiente ? "Creando…" : "Comenzar con el asistente visual"}
        </Boton>
        <span className="text-xs text-texto-suave">La comunidad queda “En configuración”: nada se cobra ni se muestra a residentes.</span>
      </div>
    </form>
  );
}
