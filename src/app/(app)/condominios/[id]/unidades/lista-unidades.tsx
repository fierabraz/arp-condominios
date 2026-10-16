"use client";

import Link from "next/link";
import { useState } from "react";
import { Search } from "lucide-react";
import { Insignia, Tabla, Vacio } from "@/components/ui";

export type FilaUnidad = {
  id: string;
  numero: string;
  tipo: string;
  alicuota: string;
  propietarios: string;
  residentes: string;
  deudaVencida: boolean;
};

const FILTROS = {
  todas: { texto: "Todas", cumple: () => true },
  deuda: { texto: "Con deuda", cumple: (u: FilaUnidad) => u.deudaVencida },
  sinPropietario: { texto: "Sin propietario", cumple: (u: FilaUnidad) => !u.propietarios },
} as const;
type Filtro = keyof typeof FILTROS;

/** Unidades con buscador y filtros: tarjetas en el teléfono, tabla en pantallas grandes. */
export function ListaUnidades({ unidades, base, editable }: { unidades: FilaUnidad[]; base: string; editable: boolean }) {
  const [texto, setTexto] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const q = texto.trim().toLowerCase();
  const visibles = unidades.filter(
    (u) =>
      FILTROS[filtro].cumple(u) &&
      (!q || [u.numero, u.propietarios, u.residentes].some((s) => s.toLowerCase().includes(q))),
  );
  const cuenta = (f: Filtro) => unidades.filter(FILTROS[f].cumple).length;
  const estado = (u: FilaUnidad) =>
    u.deudaVencida ? <Insignia tono="peligro">Deuda vencida</Insignia> : <Insignia tono="exito">Al día</Insignia>;
  const numero = (u: FilaUnidad) =>
    editable ? (
      <Link href={`${base}/${u.id}`} className="font-semibold text-marca hover:underline">
        {u.numero}
      </Link>
    ) : (
      <span className="font-semibold">{u.numero}</span>
    );

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
        <label className="flex min-h-12 flex-1 items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 focus-within:border-marca focus-within:ring-2 focus-within:ring-marca-suave">
          <Search size={18} className="text-texto-suave" aria-hidden="true" />
          <span className="sr-only">Buscar unidad o persona</span>
          <input
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar unidad o persona"
            className="min-w-0 flex-1 bg-transparent text-base outline-none md:text-sm"
          />
        </label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar unidades">
          {(Object.keys(FILTROS) as Filtro[]).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filtro === f}
              onClick={() => setFiltro(f)}
              className={`min-h-11 rounded-full px-4 text-sm font-semibold ${
                filtro === f ? "bg-texto text-white" : "border border-gray-300 bg-white text-texto hover:bg-fondo"
              }`}
            >
              {FILTROS[f].texto}
              {f !== "todas" && ` (${cuenta(f)})`}
            </button>
          ))}
        </div>
      </div>

      {visibles.length === 0 ? (
        <Vacio>No hay unidades que coincidan.</Vacio>
      ) : (
        <>
          <ul className="space-y-2 md:hidden">
            {visibles.map((u) => {
              const contenido = (
                <>
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-lg font-bold">{u.numero}</span>
                    {estado(u)}
                  </span>
                  {u.propietarios ? (
                    <span>{u.propietarios} · propietario</span>
                  ) : (
                    <span className="text-alerta">Sin propietario registrado</span>
                  )}
                  {u.residentes && <span className="text-sm">Residente: {u.residentes}</span>}
                  <span className="text-sm text-texto-suave">
                    {u.tipo} · alícuota {u.alicuota}
                  </span>
                </>
              );
              const clase = "flex flex-col gap-1.5 rounded-2xl border border-borde bg-white p-4";
              return (
                <li key={u.id}>
                  {editable ? (
                    <Link href={`${base}/${u.id}`} className={`${clase} hover:border-marca`}>
                      {contenido}
                    </Link>
                  ) : (
                    <div className={clase}>{contenido}</div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="hidden md:block">
            <Tabla>
              <thead>
                <tr>
                  <th>Unidad</th>
                  <th>Tipo</th>
                  <th className="text-right">Alícuota</th>
                  <th>Propietario</th>
                  <th>Residente</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((u) => (
                  <tr key={u.id}>
                    <td>{numero(u)}</td>
                    <td>{u.tipo}</td>
                    <td className="text-right tabular-nums">{u.alicuota}</td>
                    <td>{u.propietarios || <span className="text-alerta">Sin propietario</span>}</td>
                    <td>{u.residentes || "—"}</td>
                    <td>{estado(u)}</td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          </div>
        </>
      )}
    </>
  );
}
