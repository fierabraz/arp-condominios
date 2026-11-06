"use client";

import { startTransition, useActionState } from "react";
import { Boton, Campo, Input, Mensaje } from "@/components/ui";
import type { EstadoForm } from "@/lib/forms";

export type ValoresEspacio = {
  nombre?: string;
  descripcion?: string;
  normas?: string;
  capacidad?: string;
  turnos?: string;
  costo?: string;
  requiereAprobacion?: boolean;
  anticipacionMaximaDias?: string;
  maximoPorMes?: string;
  bloquearMorosos?: boolean;
  activo?: boolean;
};

const areaTexto =
  "w-full rounded-xl border border-borde bg-white px-3 py-2 text-base focus:border-convive focus:outline-none focus:ring-2 focus:ring-convive/25 md:text-sm";

/** Datos y reglas de un espacio reservable (quincho, sala de eventos, piscina...). */
export function EspacioForm({
  accion,
  valores,
  edicion,
}: {
  accion: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>;
  valores: ValoresEspacio;
  edicion: boolean;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  const e = estado.errores ?? {};
  // Si hubo errores, se muestra lo que se escribió (no lo guardado).
  const v = (campo: keyof ValoresEspacio) => (estado.valores?.[campo] ?? valores[campo] ?? "") as string;
  const marcado = (campo: "requiereAprobacion" | "bloquearMorosos" | "activo") =>
    estado.valores ? estado.valores[campo] === "on" : Boolean(valores[campo]);
  return (
    <form
      action={enviar}
      onSubmit={(ev) => {
        ev.preventDefault();
        const datos = new FormData(ev.currentTarget);
        startTransition(() => enviar(datos));
      }}
      className="grid gap-4 sm:grid-cols-2"
      key={JSON.stringify(estado.valores ?? {})}
    >
      <Campo etiqueta="Nombre" error={e.nombre}>
        <Input name="nombre" defaultValue={v("nombre")} placeholder="Ej.: Quincho, Sala de eventos, Piscina" required maxLength={80} />
      </Campo>
      <Campo etiqueta="Capacidad (personas, opcional)" error={e.capacidad}>
        <Input name="capacidad" inputMode="numeric" defaultValue={v("capacidad")} placeholder="Ej.: 30" />
      </Campo>
      <div className="sm:col-span-2">
        <Campo etiqueta="Descripción (opcional)" error={e.descripcion}>
          <Input name="descripcion" defaultValue={v("descripcion")} placeholder="Ej.: Quincho techado con parrilla, junto a la piscina" maxLength={1000} />
        </Campo>
      </div>
      <div className="sm:col-span-2">
        <Campo etiqueta="Turnos que se pueden reservar cada día (uno por línea)" error={e.turnos}>
          <textarea name="turnos" rows={3} defaultValue={v("turnos")} className={areaTexto} placeholder={"Almuerzo (12:00 a 17:00)\nNoche (19:00 a 00:00)"} />
        </Campo>
        <p className="mt-1 text-xs text-texto-suave">Si lo dejas vacío, se reserva el día completo.</p>
      </div>
      <Campo etiqueta="Costo por reserva (0 si no se cobra)" error={e.costo}>
        <Input name="costo" inputMode="numeric" defaultValue={v("costo") || "0"} />
      </Campo>
      <Campo etiqueta="Se puede reservar con hasta (días de anticipación)" error={e.anticipacionMaximaDias}>
        <Input name="anticipacionMaximaDias" inputMode="numeric" defaultValue={v("anticipacionMaximaDias") || "60"} required />
      </Campo>
      <Campo etiqueta="Máximo de reservas por unidad en un mes (opcional)" error={e.maximoPorMes}>
        <Input name="maximoPorMes" inputMode="numeric" defaultValue={v("maximoPorMes")} placeholder="Sin límite" />
      </Campo>
      <div className="space-y-2 sm:col-span-2">
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="requiereAprobacion" defaultChecked={marcado("requiereAprobacion")} className="mt-0.5 h-4 w-4 accent-marca" />
          <span>
            <strong>La administración aprueba cada reserva.</strong> Si no lo marcas, la reserva del residente queda confirmada al momento.
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="bloquearMorosos" defaultChecked={marcado("bloquearMorosos")} className="mt-0.5 h-4 w-4 accent-marca" />
          <span>
            <strong>No pueden reservar unidades con cobros vencidos.</strong> Úsalo solo si el reglamento de la comunidad lo permite.
          </span>
        </label>
        {edicion && (
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="activo" defaultChecked={marcado("activo")} className="mt-0.5 h-4 w-4 accent-marca" />
            <span>
              <strong>Disponible para reservas.</strong> Desmárcalo para cerrarlo (por ejemplo, en reparación). Las reservas ya hechas se mantienen.
            </span>
          </label>
        )}
      </div>
      <div className="sm:col-span-2">
        <Campo etiqueta="Normas de uso (opcional, el residente debe aceptarlas)" error={e.normas}>
          <textarea
            name="normas"
            rows={4}
            defaultValue={v("normas")}
            className={areaTexto}
            placeholder="Ej.: Dejar el espacio limpio. Música hasta las 00:00. Garantía de $20.000 que se devuelve al revisar el espacio."
          />
        </Campo>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Boton type="submit" disabled={pendiente}>
          {pendiente ? "Guardando…" : edicion ? "Guardar cambios" : "Crear espacio"}
        </Boton>
        <Mensaje texto={estado.mensaje} tipo={estado.ok ? "ok" : "error"} />
      </div>
    </form>
  );
}
