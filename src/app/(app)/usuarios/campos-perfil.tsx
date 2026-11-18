"use client";

import { useState } from "react";
import { Campo, Select } from "@/components/ui";
import { CARGOS } from "@/lib/cuentas-reglas";
import { PERMISOS_ASIGNABLES } from "@/lib/permisos";

type Opcion = { id: string; nombre: string };

export const PERFILES = [
  { valor: "SUBADMINISTRADOR", texto: CARGOS.SUBADMINISTRADOR.texto, ayuda: CARGOS.SUBADMINISTRADOR.ayuda },
  { valor: "ASISTENTE", texto: CARGOS.ASISTENTE.texto, ayuda: CARGOS.ASISTENTE.ayuda },
  { valor: "CONSERJE", texto: CARGOS.CONSERJE.texto, ayuda: CARGOS.CONSERJE.ayuda },
  { valor: "PERSONAL", texto: CARGOS.PERSONAL.texto, ayuda: CARGOS.PERSONAL.ayuda },
  { valor: "COMITE", texto: "Comité (solo lectura)", ayuda: "Un miembro del comité: consulta una sola comunidad, sin cambiar datos." },
  {
    valor: "PRINCIPAL",
    texto: "Administrador/a principal",
    ayuda: "Ve todas las comunidades de tu administración, también las nuevas, y maneja este equipo y sus permisos.",
  },
] as const;

/** El subadministrador ya tiene todos los permisos asignables; solo el asistente los recibe uno por uno. */
const CON_EXTRAS = ["ASISTENTE"];

/**
 * PILOTO-001: perfil de una cuenta del equipo, sus comunidades y sus permisos adicionales.
 * Lo que aquí se marque se vuelve a revisar en el servidor.
 */
export function CamposPerfil({
  condominios,
  perfil: perfilInicial = "SUBADMINISTRADOR",
  asignados = [],
  extras = [],
  errores = {},
  incluirAdministrador = false,
}: {
  condominios: Opcion[];
  perfil?: string;
  asignados?: string[];
  extras?: string[];
  errores?: Record<string, string[] | undefined>;
  /** Cuentas antiguas sin cargo: "Administrador/a" asignado a algunas comunidades. */
  incluirAdministrador?: boolean;
}) {
  const [perfil, setPerfil] = useState(perfilInicial);
  const opciones = incluirAdministrador
    ? [{ valor: "ADMINISTRADOR", texto: "Administrador/a (comunidades asignadas)", ayuda: "Administra las comunidades que le asignes." }, ...PERFILES]
    : PERFILES;
  const ayuda = opciones.find((o) => o.valor === perfil)?.ayuda;
  return (
    <>
      <Campo etiqueta="Perfil" error={errores.perfil}>
        <Select name="perfil" value={perfil} onChange={(e) => setPerfil(e.target.value)}>
          {opciones.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.texto}
            </option>
          ))}
        </Select>
        {ayuda && <span className="mt-1 block text-xs text-texto-suave">{ayuda}</span>}
      </Campo>
      {perfil !== "PRINCIPAL" && (
        <fieldset className="space-y-1 sm:col-span-2">
          <legend className="mb-1 text-sm font-semibold">{perfil === "COMITE" ? "Comunidad (una)" : "Comunidades que puede ver"}</legend>
          <div className="grid gap-1 rounded-xl border border-borde bg-white p-3 sm:grid-cols-2">
            {condominios.length === 0 && <p className="text-sm text-texto-suave">Aún no hay comunidades.</p>}
            {condominios.map((c) => (
              <label key={c.id} className="flex min-h-9 items-center gap-2 text-sm">
                <input
                  type={perfil === "COMITE" ? "radio" : "checkbox"}
                  name="asignados"
                  value={c.id}
                  defaultChecked={asignados.includes(c.id)}
                  className="size-4 accent-[var(--color-convive)]"
                />
                {c.nombre}
              </label>
            ))}
          </div>
          {errores.asignados && <span className="block text-sm text-peligro">{errores.asignados.join(" ")}</span>}
        </fieldset>
      )}
      {CON_EXTRAS.includes(perfil) && (
        <fieldset className="space-y-1 sm:col-span-2">
          <legend className="mb-1 text-sm font-semibold">Permisos adicionales</legend>
          <div className="grid gap-1 rounded-xl border border-borde bg-white p-3 sm:grid-cols-2">
            {Object.entries(PERMISOS_ASIGNABLES).map(([clave, texto]) => (
              <label key={clave} className="flex min-h-9 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="permisosExtra"
                  value={clave}
                  defaultChecked={extras.includes(clave)}
                  className="size-4 accent-[var(--color-convive)]"
                />
                {texto}
              </label>
            ))}
          </div>
          <span className="block text-xs text-texto-suave">
            Sin marcar, el asistente no verifica pagos, no ve el banco ni aprueba solicitudes de residentes.
          </span>
        </fieldset>
      )}
    </>
  );
}
