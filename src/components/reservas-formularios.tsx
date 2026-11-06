"use client";

import { useActionState } from "react";
import { Boton, Campo, Input, Mensaje, Select } from "@/components/ui";
import type { EstadoForm } from "@/lib/forms";

type Accion = (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>;

/** Formulario para reservar un turno libre del día elegido en el calendario. */
export function FormularioReserva({
  accion,
  espacioId,
  dia,
  turnosLibres,
  unidades,
  normas,
  avisoCosto,
  textoBoton,
  preseleccionar = false,
  camposOcultos = {},
}: {
  accion: Accion;
  espacioId: string;
  dia: string;
  turnosLibres: string[];
  /** Si hay una sola unidad, va oculta. */
  unidades: { id: string; nombre: string }[];
  /** Normas de uso que hay que aceptar antes de reservar (solo el residente). */
  normas?: string | null;
  avisoCosto?: string;
  textoBoton: string;
  /** El residente parte con su primera unidad elegida; la administración elige siempre. */
  preseleccionar?: boolean;
  camposOcultos?: Record<string, string>;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  const e = estado.errores ?? {};
  if (estado.ok) return <Mensaje texto={estado.mensaje} tipo="ok" />;
  return (
    <form action={enviar} className="space-y-3">
      <input type="hidden" name="espacioId" value={espacioId} />
      <input type="hidden" name="dia" value={dia} />
      {Object.entries(camposOcultos).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {unidades.length === 1 ? (
        <input type="hidden" name="unidadId" value={unidades[0].id} />
      ) : (
        <Campo etiqueta="Unidad" error={e.unidadId}>
          <Select name="unidadId" required defaultValue={preseleccionar ? unidades[0]?.id : ""}>
            <option value="" disabled>
              Elige la unidad
            </option>
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </Select>
        </Campo>
      )}
      <fieldset>
        <legend className="mb-1 block text-sm font-semibold text-texto">Turno</legend>
        <div className="space-y-2">
          {turnosLibres.map((t, i) => (
            <label key={t} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-borde bg-white px-4 py-2 hover:bg-fondo">
              <input type="radio" name="turno" value={t} required defaultChecked={i === 0} className="h-4 w-4 accent-marca" />
              {t}
            </label>
          ))}
        </div>
        {e.turno && <span className="mt-1 block text-sm text-peligro">{e.turno.join(" ")}</span>}
      </fieldset>
      <Campo etiqueta="Comentario (opcional)" error={e.observaciones}>
        <Input name="observaciones" maxLength={500} placeholder="Ej.: cumpleaños, unas 15 personas" />
      </Campo>
      {normas && (
        <label className="flex items-start gap-3 rounded-xl bg-convive-suave/50 p-3 text-sm">
          <input type="checkbox" name="aceptaNormas" required className="mt-0.5 h-4 w-4 accent-marca" />
          <span>Leí y acepto las normas de uso del espacio.</span>
        </label>
      )}
      {avisoCosto && <p className="text-sm text-texto-suave">{avisoCosto}</p>}
      <Mensaje texto={estado.mensaje} />
      <Boton type="submit" disabled={pendiente} className="w-full sm:w-auto">
        {pendiente ? "Reservando…" : textoBoton}
      </Boton>
    </form>
  );
}

/** "Rechazar" o "Cancelar": abre un formulario pequeño que pide el motivo. */
export function AccionConMotivo({
  accion,
  texto,
  textoConfirmar,
  ejemplo,
  ayuda,
  requerido = true,
}: {
  accion: Accion;
  texto: string;
  textoConfirmar: string;
  ejemplo: string;
  ayuda?: string;
  requerido?: boolean;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  if (estado.ok) return <Mensaje texto={estado.mensaje} tipo="ok" />;
  return (
    <details className="text-left">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold text-peligro hover:underline">{texto}</summary>
      <form action={enviar} className="mt-2 flex max-w-sm flex-col gap-2">
        <label className="text-xs font-semibold text-texto">
          Motivo{requerido ? "" : " (opcional)"}
          <Input name="motivo" required={requerido} minLength={requerido ? 3 : undefined} maxLength={300} placeholder={ejemplo} />
        </label>
        {estado.errores?.motivo && <span className="text-xs text-peligro">{estado.errores.motivo.join(" ")}</span>}
        <Mensaje texto={estado.mensaje} />
        <Boton type="submit" variante="peligro" disabled={pendiente}>
          {pendiente ? "Guardando…" : textoConfirmar}
        </Boton>
        {ayuda && <p className="text-xs text-texto-suave">{ayuda}</p>}
      </form>
    </details>
  );
}

/** Botón de una acción sin datos (por ejemplo, "Aprobar"), que muestra el resultado. */
export function BotonAccion({ accion, texto }: { accion: () => Promise<EstadoForm>; texto: string }) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  if (estado.ok) return <Mensaje texto={estado.mensaje} tipo="ok" />;
  return (
    <form action={enviar} className="flex flex-col gap-2">
      <Boton type="submit" disabled={pendiente}>
        {pendiente ? "Guardando…" : texto}
      </Boton>
      <Mensaje texto={estado.mensaje} />
    </form>
  );
}
