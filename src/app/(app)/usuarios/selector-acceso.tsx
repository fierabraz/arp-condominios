"use client";

import { useState } from "react";

type Opcion = { id: string; nombre: string };

/**
 * Qué propiedades ve un administrador: todas (principal) o solo las marcadas.
 * Se envía como accesoTodas=si o como una lista de asignados.
 */
export function SelectorAcceso({
  condominios,
  todas: todasInicial = false,
  asignados = [],
  error,
}: {
  condominios: Opcion[];
  todas?: boolean;
  asignados?: string[];
  error?: string[];
}) {
  const [todas, setTodas] = useState(todasInicial);
  return (
    <fieldset className="space-y-2 sm:col-span-2">
      <legend className="mb-1 text-sm font-semibold text-texto">Propiedades que puede ver</legend>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="accesoTodas"
          value="si"
          checked={todas}
          onChange={(ev) => setTodas(ev.target.checked)}
          className="mt-0.5 size-4 accent-[var(--color-convive)]"
        />
        <span>
          <span className="font-semibold">Todas (administrador principal)</span>
          <span className="block text-texto-suave">
            Ve todas las propiedades, también las que se creen después, y maneja estas cuentas.
          </span>
        </span>
      </label>
      {!todas && (
        <div className="grid gap-1 rounded-xl border border-borde bg-white p-3 sm:grid-cols-2">
          {condominios.length === 0 && <p className="text-sm text-texto-suave">Aún no hay propiedades.</p>}
          {condominios.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="asignados"
                value={c.id}
                defaultChecked={asignados.includes(c.id)}
                className="size-4 accent-[var(--color-convive)]"
              />
              {c.nombre}
            </label>
          ))}
        </div>
      )}
      {error && <span className="block text-sm text-peligro">{error.join(" ")}</span>}
    </fieldset>
  );
}
