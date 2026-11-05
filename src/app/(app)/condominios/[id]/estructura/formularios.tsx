"use client";

// COM-001 · Entrega 2: formularios de la estructura física.

import { useActionState, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Boton, Campo, Input, Mensaje, Select } from "@/components/ui";
import type { EstadoForm } from "@/lib/forms";
import {
  CLASES,
  DESTINOS,
  ESTADOS_INSTALACION,
  REGIMENES,
  revisarEspacio,
  TIPOS_AGRUPACION,
  TIPOS_ASIGNACION,
  TIPOS_INSTALACION,
  type Destino,
  type Regimen,
} from "@/lib/estructura";

type Accion = (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>;
export type Opcion = { id: string; texto: string };

const textarea =
  "min-h-20 w-full rounded-xl border border-borde bg-white px-3 py-2 text-base focus:border-convive focus:outline-none focus:ring-2 focus:ring-convive/25 md:text-sm";

function Opciones({ opciones, vacio }: { opciones: Opcion[]; vacio: string }) {
  return (
    <>
      <option value="">{vacio}</option>
      {opciones.map((o) => (
        <option key={o.id} value={o.id}>
          {o.texto}
        </option>
      ))}
    </>
  );
}

function Texto({ etiqueta, name, valor, error, placeholder, ayuda }: { etiqueta: string; name: string; valor?: string | null; error?: string[]; placeholder?: string; ayuda?: ReactNode }) {
  return (
    <label className="block sm:col-span-2">
      <span className="mb-1 block text-sm font-semibold text-texto">{etiqueta}</span>
      <textarea name={name} className={textarea} defaultValue={valor ?? ""} placeholder={placeholder} />
      {ayuda && <span className="mt-1 block text-xs text-texto-suave">{ayuda}</span>}
      {error && <span className="mt-1 block text-sm text-peligro">{error.join(" ")}</span>}
    </label>
  );
}

function Pie({ pendiente, texto, estado }: { pendiente: boolean; texto: string; estado: EstadoForm }) {
  return (
    <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
      <Boton type="submit" disabled={pendiente}>
        {pendiente ? "Guardando…" : texto}
      </Boton>
      <Mensaje texto={estado.mensaje} tipo={estado.ok ? "ok" : "error"} />
    </div>
  );
}

/** Botón de una acción sin formulario (eliminar), con confirmación. */
export function BotonAccion({
  accion,
  pregunta,
  children,
}: {
  accion: () => Promise<EstadoForm>;
  pregunta: string;
  children: ReactNode;
}) {
  const [pendiente, iniciar] = useTransition();
  const [mensaje, setMensaje] = useState<string>();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Boton
        type="button"
        variante="peligro"
        disabled={pendiente}
        onClick={() => {
          if (!confirm(pregunta)) return;
          iniciar(async () => {
            const r = await accion();
            setMensaje(r?.ok ? undefined : r?.mensaje);
          });
        }}
      >
        {children}
      </Boton>
      <Mensaje texto={mensaje} />
    </span>
  );
}

// ── Agrupaciones ───────────────────────────────────────────────────────────

export function AgrupacionForm({ accion, agrupaciones }: { accion: Accion; agrupaciones: Opcion[] }) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado.ok) form.current?.reset();
  }, [estado]);
  const e = estado.errores ?? {};
  return (
    <form ref={form} action={enviar} className="grid items-start gap-4 sm:grid-cols-4">
      <Campo etiqueta="Tipo" error={e.tipo}>
        <Select name="tipo" defaultValue="TORRE">
          {Object.entries(TIPOS_AGRUPACION).map(([v, t]) => (
            <option key={v} value={v}>
              {t}
            </option>
          ))}
        </Select>
      </Campo>
      <Campo etiqueta="Nombre o número" error={e.nombre}>
        <Input name="nombre" placeholder="A, Norte, 3, -1…" required />
      </Campo>
      <Campo etiqueta="Dentro de" error={e.padreId}>
        <Select name="padreId" defaultValue="">
          <Opciones opciones={agrupaciones} vacio="Ninguna (nivel principal)" />
        </Select>
      </Campo>
      <div className="pt-6">
        <Boton type="submit" disabled={pendiente} className="w-full">
          {pendiente ? "Guardando…" : "Agregar"}
        </Boton>
      </div>
      <div className="sm:col-span-4">
        <Mensaje texto={estado.mensaje} tipo={estado.ok ? "ok" : "error"} />
      </div>
    </form>
  );
}

// ── Estacionamientos y bodegas ─────────────────────────────────────────────

export type ValoresEspacio = {
  clase?: string;
  codigo?: string;
  agrupacionId?: string | null;
  ubicacion?: string | null;
  regimen?: string;
  destino?: string | null;
  accesible?: boolean;
  fueraDeUso?: boolean;
  unidadPropiaId?: string | null;
  unidadPrincipalId?: string | null;
  respaldo?: string | null;
  observaciones?: string | null;
};

export function EspacioForm({
  accion,
  valores = {},
  agrupaciones,
  unidades,
  textoBoton,
}: {
  accion: Accion;
  valores?: ValoresEspacio;
  agrupaciones: Opcion[];
  unidades: Opcion[];
  textoBoton: string;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  const [regimen, setRegimen] = useState<Regimen>((valores.regimen as Regimen) ?? "POR_DEFINIR");
  const [destino, setDestino] = useState(valores.destino ?? "");
  const e = estado.errores ?? {};
  // Las mismas reglas del servidor, para avisar antes de guardar (la unidad se revisa al guardar).
  const avisos = revisarEspacio({ regimen, destino: (destino || null) as Destino | null, unidadPropiaId: null, unidadPrincipalId: null }).advertencias.filter(
    (a) => !a.startsWith("Falta indicar la unidad"),
  );
  return (
    <form action={enviar} className="grid gap-4 sm:grid-cols-2">
      <Campo etiqueta="Clase" error={e.clase}>
        <Select name="clase" defaultValue={valores.clase ?? "ESTACIONAMIENTO"}>
          {Object.entries(CLASES).map(([v, c]) => (
            <option key={v} value={v}>
              {c.singular}
            </option>
          ))}
        </Select>
      </Campo>
      <Campo etiqueta="Código o número" error={e.codigo}>
        <Input name="codigo" defaultValue={valores.codigo} placeholder="E-12, B-3, V-1…" required />
      </Campo>
      <Campo etiqueta="Torre, sector o nivel" error={e.agrupacionId}>
        <Select name="agrupacionId" defaultValue={valores.agrupacionId ?? ""}>
          <Opciones opciones={agrupaciones} vacio="Sin indicar" />
        </Select>
      </Campo>
      <Campo etiqueta="Ubicación (detalle)" error={e.ubicacion}>
        <Input name="ubicacion" defaultValue={valores.ubicacion ?? ""} placeholder="Junto al ascensor, frente a la rampa…" />
      </Campo>

      <fieldset className="grid gap-4 border-t border-borde pt-4 sm:col-span-2 sm:grid-cols-2">
        <legend className="mb-1 sm:col-span-2">
          <span className="block text-base font-bold text-convive-oscuro">Propiedad</span>
          <span className="block text-sm text-texto-suave">De quién es, según la escritura o el reglamento. No es lo mismo que quién lo usa.</span>
        </legend>
        <Campo etiqueta="Condición jurídica" error={e.regimen}>
          <Select name="regimen" value={regimen} onChange={(ev) => setRegimen(ev.target.value as Regimen)} aria-describedby="ayuda-regimen">
            {Object.entries(REGIMENES).map(([v, r]) => (
              <option key={v} value={v}>
                {r.texto}
              </option>
            ))}
          </Select>
          <span id="ayuda-regimen" className="mt-1 block text-xs text-texto-suave">
            {REGIMENES[regimen].ayuda}
          </span>
        </Campo>
        {regimen === "ACCESORIO" && (
          <Campo etiqueta="Unidad a la que pertenece" error={e.unidadPrincipalId}>
            <Select name="unidadPrincipalId" defaultValue={valores.unidadPrincipalId ?? ""} required>
              <Opciones opciones={unidades} vacio="Elige la unidad" />
            </Select>
          </Campo>
        )}
        {regimen === "UNIDAD_PRIVADA" && (
          <Campo etiqueta="Unidad con alícuota que lo representa" error={e.unidadPropiaId}>
            <Select name="unidadPropiaId" defaultValue={valores.unidadPropiaId ?? ""} aria-describedby="ayuda-propia">
              <Opciones opciones={unidades} vacio="Sin vincular todavía" />
            </Select>
            <span id="ayuda-propia" className="mt-1 block text-xs text-texto-suave">
              Créala primero en Unidades (tipo estacionamiento o bodega) para que se cobre.
            </span>
          </Campo>
        )}
        <Campo etiqueta="Respaldo" error={e.respaldo}>
          <Input name="respaldo" defaultValue={valores.respaldo ?? ""} placeholder="Escritura, plano, reglamento art. 12…" />
        </Campo>
      </fieldset>

      <fieldset className="grid gap-4 border-t border-borde pt-4 sm:col-span-2 sm:grid-cols-2">
        <legend className="mb-1 sm:col-span-2">
          <span className="block text-base font-bold text-convive-oscuro">Uso</span>
          <span className="block text-sm text-texto-suave">Para qué se destina. Quién lo usa se registra después, en la ficha.</span>
        </legend>
        <Campo etiqueta="Destino" error={e.destino}>
          <Select name="destino" value={destino} onChange={(ev) => setDestino(ev.target.value)}>
            <option value="">Sin indicar</option>
            {Object.entries(DESTINOS).map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </Select>
        </Campo>
        <div className="grid content-start gap-3 pt-1 sm:pt-7">
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" name="accesible" defaultChecked={valores.accesible} className="size-5 accent-[var(--color-marca)]" />
            Accesible (para personas con discapacidad)
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" name="fueraDeUso" defaultChecked={valores.fueraDeUso} className="size-5 accent-[var(--color-marca)]" />
            Fuera de uso
          </label>
        </div>
      </fieldset>

      {avisos.length > 0 && (
        <ul className="list-disc rounded-xl bg-alerta-suave py-2 pr-3 pl-7 text-sm text-alerta sm:col-span-2">
          {avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}

      <Texto etiqueta="Observaciones" name="observaciones" valor={valores.observaciones} error={e.observaciones} />
      <Pie pendiente={pendiente} texto={textoBoton} estado={estado} />
    </form>
  );
}

// ── Asignaciones de uso ────────────────────────────────────────────────────

export function AsignacionForm({ accion, unidades, personas, hoy }: { accion: Accion; unidades: Opcion[]; personas: Opcion[]; hoy: string }) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  const [quien, setQuien] = useState<"unidad" | "persona" | "otro">("unidad");
  const [tipo, setTipo] = useState("PERMANENTE");
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado.ok) form.current?.reset();
  }, [estado]);
  const e = estado.errores ?? {};
  return (
    <form ref={form} action={enviar} className="grid gap-4 sm:grid-cols-2">
      <Campo etiqueta="Tipo de asignación" error={e.tipo}>
        <Select name="tipo" value={tipo} onChange={(ev) => setTipo(ev.target.value)}>
          {Object.entries(TIPOS_ASIGNACION).map(([v, t]) => (
            <option key={v} value={v}>
              {t}
            </option>
          ))}
        </Select>
      </Campo>
      <Campo etiqueta="Se asigna a">
        <Select value={quien} onChange={(ev) => setQuien(ev.target.value as typeof quien)}>
          <option value="unidad">Una unidad</option>
          <option value="persona">Una persona de la propiedad</option>
          <option value="otro">Otro (conserjería, proveedor…)</option>
        </Select>
      </Campo>
      {quien === "unidad" && (
        <Campo etiqueta="Unidad" error={e.unidadId}>
          <Select name="unidadId" required defaultValue="">
            <Opciones opciones={unidades} vacio="Elige la unidad" />
          </Select>
        </Campo>
      )}
      {quien === "persona" && (
        <Campo etiqueta="Persona" error={e.personaId}>
          <Select name="personaId" required defaultValue="">
            <Opciones opciones={personas} vacio={personas.length ? "Elige la persona" : "Aún no hay personas vinculadas"} />
          </Select>
        </Campo>
      )}
      {quien === "otro" && (
        <Campo etiqueta="Nombre" error={e.otro}>
          <Input name="otro" required placeholder="Conserjería, Empresa de aseo…" />
        </Campo>
      )}
      <Campo etiqueta="Respaldo (acta, contrato, acuerdo)" error={e.respaldo}>
        <Input name="respaldo" placeholder="Acta de asamblea 12-03-2026…" />
      </Campo>
      <Campo etiqueta="Desde" error={e.desde}>
        <Input name="desde" type="date" defaultValue={hoy} required />
      </Campo>
      <Campo etiqueta={tipo === "TEMPORAL" ? "Hasta" : "Hasta (opcional)"} error={e.hasta}>
        <Input name="hasta" type="date" required={tipo === "TEMPORAL"} />
      </Campo>
      <Texto etiqueta="Observaciones" name="observaciones" error={e.observaciones} />
      <Pie pendiente={pendiente} texto="Asignar uso" estado={estado} />
    </form>
  );
}

export function TerminarAsignacionForm({ accion, hoy }: { accion: Accion; hoy: string }) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  return (
    <form action={enviar} className="flex flex-wrap items-end gap-2">
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-texto-suave">Termina el</span>
        <Input name="hasta" type="date" defaultValue={hoy} required />
      </label>
      <Boton type="submit" variante="secundario" disabled={pendiente}>
        {pendiente ? "Guardando…" : "Terminar"}
      </Boton>
      <Mensaje texto={estado.mensaje} tipo={estado.ok ? "ok" : "error"} />
    </form>
  );
}

// ── Instalaciones ──────────────────────────────────────────────────────────

export type ValoresInstalacion = {
  tipo?: string;
  codigo?: string;
  nombre?: string;
  agrupacionId?: string | null;
  ubicacion?: string | null;
  descripcion?: string | null;
  estado?: string;
  proveedorId?: string | null;
  observaciones?: string | null;
};

export function InstalacionForm({
  accion,
  valores = {},
  agrupaciones,
  proveedores,
  textoBoton,
}: {
  accion: Accion;
  valores?: ValoresInstalacion;
  agrupaciones: Opcion[];
  proveedores: Opcion[];
  textoBoton: string;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  const e = estado.errores ?? {};
  return (
    <form action={enviar} className="grid gap-4 sm:grid-cols-2">
      <Campo etiqueta="Tipo" error={e.tipo}>
        <Select name="tipo" defaultValue={valores.tipo ?? "ASCENSOR"}>
          {Object.entries(TIPOS_INSTALACION).map(([v, t]) => (
            <option key={v} value={v}>
              {t}
            </option>
          ))}
        </Select>
      </Campo>
      <Campo etiqueta="Código" error={e.codigo}>
        <Input name="codigo" defaultValue={valores.codigo} placeholder="ASC-1, BOM-1…" required />
      </Campo>
      <Campo etiqueta="Nombre" error={e.nombre}>
        <Input name="nombre" defaultValue={valores.nombre} placeholder="Ascensor torre A" required />
      </Campo>
      <Campo etiqueta="Estado" error={e.estado}>
        <Select name="estado" defaultValue={valores.estado ?? "SIN_INFORMACION"}>
          {Object.entries(ESTADOS_INSTALACION).map(([v, t]) => (
            <option key={v} value={v}>
              {t}
            </option>
          ))}
        </Select>
      </Campo>
      <Campo etiqueta="Torre, sector o nivel" error={e.agrupacionId}>
        <Select name="agrupacionId" defaultValue={valores.agrupacionId ?? ""}>
          <Opciones opciones={agrupaciones} vacio="Sin indicar" />
        </Select>
      </Campo>
      <Campo etiqueta="Ubicación (detalle)" error={e.ubicacion}>
        <Input name="ubicacion" defaultValue={valores.ubicacion ?? ""} placeholder="Sala de máquinas, subterráneo -1…" />
      </Campo>
      <Campo etiqueta="Proveedor de mantención (opcional)" error={e.proveedorId}>
        <Select name="proveedorId" defaultValue={valores.proveedorId ?? ""}>
          <Opciones opciones={proveedores} vacio={proveedores.length ? "Sin indicar" : "No hay proveedores en el catálogo"} />
        </Select>
      </Campo>
      <Texto etiqueta="Descripción" name="descripcion" valor={valores.descripcion} error={e.descripcion} placeholder="Marca, modelo, capacidad, año…" />
      <Texto etiqueta="Observaciones" name="observaciones" valor={valores.observaciones} error={e.observaciones} />
      <Pie pendiente={pendiente} texto={textoBoton} estado={estado} />
    </form>
  );
}
