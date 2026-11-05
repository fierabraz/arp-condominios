"use client";

import { useActionState, type ReactNode } from "react";
import { Boton, Campo, Input, Mensaje, Select } from "@/components/ui";
import type { EstadoForm } from "@/lib/forms";
import { MODALIDADES, TIPOS } from "@/lib/configuracion";

// Regiones de Chile, para elegir sin errores de escritura.
const REGIONES = [
  "Arica y Parinacota",
  "Tarapacá",
  "Antofagasta",
  "Atacama",
  "Coquimbo",
  "Valparaíso",
  "Metropolitana de Santiago",
  "Libertador General Bernardo O'Higgins",
  "Maule",
  "Ñuble",
  "Biobío",
  "La Araucanía",
  "Los Ríos",
  "Los Lagos",
  "Aysén del General Carlos Ibáñez del Campo",
  "Magallanes y de la Antártica Chilena",
];

type Valores = {
  nombre?: string;
  direccion?: string;
  comuna?: string | null;
  region?: string | null;
  rut?: string | null;
  tipo?: string | null;
  modalidad?: string | null;
  fechaIncorporacion?: string | null;
  reglamento?: string | null;
  observaciones?: string | null;
  porcentajeReserva?: string;
  tasaInteresMora?: string;
  diaVencimiento?: number;
  totalUnidades?: number | null;
};

function Grupo({ titulo, descripcion, children }: { titulo: string; descripcion?: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-4 border-t border-borde pt-5 first:border-t-0 first:pt-0 sm:col-span-2 sm:grid-cols-2">
      <legend className="mb-1 sm:col-span-2">
        <span className="block text-base font-bold text-convive-oscuro">{titulo}</span>
        {descripcion && <span className="block text-sm text-texto-suave">{descripcion}</span>}
      </legend>
      {children}
    </fieldset>
  );
}

const textarea =
  "min-h-24 w-full rounded-xl border border-borde bg-white px-3 py-2 text-base focus:border-convive focus:outline-none focus:ring-2 focus:ring-convive/25 md:text-sm";

export function CondominioForm({
  accion,
  valores = {},
  textoBoton,
  volver,
}: {
  accion: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>;
  valores?: Valores;
  textoBoton: string;
  /** "configuracion": al guardar, vuelve al configurador. */
  volver?: string;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  const e = estado.errores ?? {};
  return (
    <form action={enviar} className="grid gap-6 sm:grid-cols-2">
      {volver && <input type="hidden" name="volver" value={volver} />}
      <p className="text-sm text-texto-suave sm:col-span-2">
        Solo el nombre y la dirección son obligatorios. Puedes guardar ahora y completar el resto después.
      </p>

      <Grupo titulo="Identificación">
        <Campo etiqueta="Nombre" error={e.nombre}>
          <Input name="nombre" defaultValue={valores.nombre} required />
        </Campo>
        <Campo etiqueta="Tipo de comunidad" error={e.tipo}>
          <Select name="tipo" defaultValue={valores.tipo ?? ""}>
            <option value="">Sin indicar</option>
            {Object.entries(TIPOS).map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo etiqueta="RUT de la comunidad (si tiene)" error={e.rut}>
          <Input name="rut" defaultValue={valores.rut ?? ""} placeholder="65.051.145-K" />
        </Campo>
        <Campo etiqueta="¿Es nueva o ya funcionaba?" error={e.modalidad}>
          <Select name="modalidad" defaultValue={valores.modalidad ?? ""} aria-describedby="ayuda-modalidad">
            <option value="">Sin indicar</option>
            {Object.entries(MODALIDADES).map(([v, m]) => (
              <option key={v} value={v}>
                {m.texto}
              </option>
            ))}
          </Select>
          <span id="ayuda-modalidad" className="mt-1 block text-xs text-texto-suave">
            Existente: ya tiene deudas, fondos o saldos de otra administración que habrá que traer.
          </span>
        </Campo>
      </Grupo>

      <Grupo titulo="Ubicación">
        <Campo etiqueta="Dirección" error={e.direccion}>
          <Input name="direccion" defaultValue={valores.direccion} required />
        </Campo>
        <Campo etiqueta="Comuna o ciudad" error={e.comuna}>
          <Input name="comuna" defaultValue={valores.comuna ?? ""} />
        </Campo>
        <Campo etiqueta="Región" error={e.region}>
          <Select name="region" defaultValue={valores.region ?? ""}>
            <option value="">Sin indicar</option>
            {REGIONES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </Campo>
      </Grupo>

      <Grupo titulo="Antecedentes administrativos" descripcion="Lo que tengas a mano; se puede completar después.">
        <Campo etiqueta="Fecha de incorporación a Convive" error={e.fechaIncorporacion}>
          <Input name="fechaIncorporacion" type="date" defaultValue={valores.fechaIncorporacion ?? ""} />
        </Campo>
        <Campo etiqueta="Cantidad total de unidades" error={e.totalUnidades}>
          <Input
            name="totalUnidades"
            type="number"
            min={1}
            max={10000}
            defaultValue={valores.totalUnidades ?? ""}
            placeholder="Ej. 100"
            aria-describedby="ayuda-total-unidades"
          />
          <span id="ayuda-total-unidades" className="mt-1 block text-xs text-texto-suave">
            Departamentos, casas, locales, estacionamientos y bodegas con alícuota propia. Sirve para seguir el avance mientras
            las cargas.
          </span>
        </Campo>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-semibold text-texto">Reglamento de copropiedad</span>
          <textarea
            name="reglamento"
            className={textarea}
            defaultValue={valores.reglamento ?? ""}
            placeholder="Ej. Inscrito a fojas 1234 N° 567 del Registro de Propiedad del CBR de Santiago, año 2015. Notaría…"
          />
          {e.reglamento && <span className="mt-1 block text-sm text-peligro">{e.reglamento.join(" ")}</span>}
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-semibold text-texto">Información complementaria</span>
          <textarea
            name="observaciones"
            className={textarea}
            defaultValue={valores.observaciones ?? ""}
            placeholder="Administración anterior, contacto del comité, particularidades de la comunidad…"
          />
          {e.observaciones && <span className="mt-1 block text-sm text-peligro">{e.observaciones.join(" ")}</span>}
        </label>
      </Grupo>

      <Grupo
        titulo="Reglas de cobro"
        descripcion="Traen valores habituales. Revísalos antes de habilitar los cobros de la propiedad."
      >
        <Campo etiqueta="Fondo de reserva (% del gasto común)" error={e.porcentajeReserva}>
          <Input name="porcentajeReserva" inputMode="decimal" defaultValue={valores.porcentajeReserva ?? "5"} />
        </Campo>
        <Campo etiqueta="Interés por mora (% mensual)" error={e.tasaInteresMora}>
          <Input name="tasaInteresMora" inputMode="decimal" defaultValue={valores.tasaInteresMora ?? "0"} />
        </Campo>
        <Campo etiqueta="Día de vencimiento del cobro" error={e.diaVencimiento}>
          <Input name="diaVencimiento" type="number" min={1} max={28} defaultValue={valores.diaVencimiento ?? 10} />
        </Campo>
      </Grupo>

      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Boton type="submit" disabled={pendiente}>
          {pendiente ? "Guardando…" : textoBoton}
        </Boton>
        <Mensaje texto={estado.mensaje} />
      </div>
    </form>
  );
}
