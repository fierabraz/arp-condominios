"use server";

// COM-001 · Entrega 2: estructura física (agrupaciones, estacionamientos y bodegas, asignaciones
// de uso e instalaciones). Toda acción comprueba que la propiedad sea visible para la cuenta.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { puedeVerPropiedad, requireAdministradora } from "@/lib/auth";
import { aFechaDia, aTexto, erroresDe, type EstadoForm } from "@/lib/forms";
import { registrar } from "@/lib/registro";
import {
  ClaseEspacio,
  DestinoEspacio,
  EstadoInstalacion,
  RegimenEspacio,
  TipoAgrupacion,
  TipoAsignacion,
  TipoInstalacion,
} from "@/generated/prisma/enums";
import {
  CLASES,
  DESTINOS,
  REGIMENES,
  revisarAsignacion,
  revisarEspacio,
  hoyDia,
  TIPOS_AGRUPACION,
  vigente,
} from "@/lib/estructura";

const NO_ENCONTRADA = { mensaje: "Propiedad no encontrada." };

async function propiedad(condominioId: string) {
  const { usuario, administradoraId } = await requireAdministradora();
  if (!puedeVerPropiedad(usuario, condominioId)) return null;
  const c = await db.condominio.findFirst({ where: { id: condominioId, administradoraId }, select: { id: true } });
  return c ? { usuario, administradoraId } : null;
}

const refrescar = (condominioId: string) => revalidatePath(`/condominios/${condominioId}`, "layout");

/** Comprueba que un id opcional (agrupación, unidad, persona, proveedor) sea de esta propiedad. */
async function deLaPropiedad(
  tabla: "agrupacion" | "unidad",
  id: string | undefined,
  condominioId: string,
): Promise<string | null | false> {
  if (!id) return null;
  const n =
    tabla === "agrupacion"
      ? await db.agrupacion.count({ where: { id, condominioId } })
      : await db.unidad.count({ where: { id, condominioId } });
  return n ? id : false;
}

// ── Agrupaciones ───────────────────────────────────────────────────────────

const AgrupacionSchema = z.object({
  tipo: z.enum(TipoAgrupacion, { error: "Elige un tipo." }),
  nombre: z.string({ error: "Ingresa el nombre." }).min(1, { error: "Ingresa el nombre." }).max(60),
  padreId: z.string().optional(),
});

export async function crearAgrupacion(condominioId: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const p = await propiedad(condominioId);
  if (!p) return NO_ENCONTRADA;
  const datos = AgrupacionSchema.safeParse({
    tipo: formData.get("tipo"),
    nombre: aTexto(formData.get("nombre")),
    padreId: aTexto(formData.get("padreId")),
  });
  if (!datos.success) return erroresDe(datos.error);
  const padreId = await deLaPropiedad("agrupacion", datos.data.padreId, condominioId);
  if (padreId === false) return { errores: { padreId: ["Elige una agrupación de esta propiedad."] } };
  const repetida = await db.agrupacion.count({ where: { condominioId, padreId, nombre: datos.data.nombre } });
  if (repetida) return { errores: { nombre: ["Ya existe una con ese nombre en el mismo lugar."] } };
  const orden = await db.agrupacion.count({ where: { condominioId, padreId } });
  await db.agrupacion.create({
    data: { administradoraId: p.administradoraId, condominioId, tipo: datos.data.tipo, nombre: datos.data.nombre, padreId, orden },
  });
  await registrar(p.usuario, "Agregó una agrupación", `${TIPOS_AGRUPACION[datos.data.tipo]} ${datos.data.nombre}`, condominioId);
  refrescar(condominioId);
  return { ok: true, mensaje: `${TIPOS_AGRUPACION[datos.data.tipo]} ${datos.data.nombre} agregado.` };
}

/** Solo se elimina si está vacía: sin subagrupaciones, unidades, espacios ni instalaciones. */
export async function eliminarAgrupacion(condominioId: string, agrupacionId: string): Promise<EstadoForm> {
  const p = await propiedad(condominioId);
  if (!p) return NO_ENCONTRADA;
  const a = await db.agrupacion.findFirst({
    where: { id: agrupacionId, condominioId },
    include: { _count: { select: { hijas: true, unidades: true, espacios: true, instalaciones: true } } },
  });
  if (!a) return { mensaje: "No encontrada." };
  const usos = a._count.hijas + a._count.unidades + a._count.espacios + a._count.instalaciones;
  if (usos > 0) return { mensaje: "No se puede eliminar: tiene unidades, espacios, instalaciones o subdivisiones. Muévelos primero." };
  await db.agrupacion.delete({ where: { id: a.id } });
  await registrar(p.usuario, "Eliminó una agrupación vacía", `${TIPOS_AGRUPACION[a.tipo]} ${a.nombre}`, condominioId);
  refrescar(condominioId);
  return { ok: true };
}

// ── Estacionamientos y bodegas ─────────────────────────────────────────────

const EspacioSchema = z.object({
  clase: z.enum(ClaseEspacio, { error: "Elige estacionamiento o bodega." }),
  codigo: z.string({ error: "Ingresa el código." }).min(1, { error: "Ingresa el código." }).max(30),
  agrupacionId: z.string().optional(),
  ubicacion: z.string().max(200).optional(),
  regimen: z.enum(RegimenEspacio, { error: "Elige la condición." }),
  destino: z.enum(DestinoEspacio, { error: "Elige el destino." }).nullable(),
  accesible: z.boolean(),
  fueraDeUso: z.boolean(),
  unidadPropiaId: z.string().optional(),
  unidadPrincipalId: z.string().optional(),
  respaldo: z.string().max(500).optional(),
  observaciones: z.string().max(2000).optional(),
});

function leerEspacio(formData: FormData) {
  return EspacioSchema.safeParse({
    clase: formData.get("clase"),
    codigo: aTexto(formData.get("codigo")),
    agrupacionId: aTexto(formData.get("agrupacionId")),
    ubicacion: aTexto(formData.get("ubicacion")),
    regimen: formData.get("regimen"),
    destino: aTexto(formData.get("destino")) ?? null,
    accesible: formData.get("accesible") === "on",
    fueraDeUso: formData.get("fueraDeUso") === "on",
    unidadPropiaId: aTexto(formData.get("unidadPropiaId")),
    unidadPrincipalId: aTexto(formData.get("unidadPrincipalId")),
    respaldo: aTexto(formData.get("respaldo")),
    observaciones: aTexto(formData.get("observaciones")),
  });
}

type Espacio = z.infer<typeof EspacioSchema>;
const resumenEspacio = (e: Espacio, unidades: Map<string, string>) =>
  [
    REGIMENES[e.regimen].texto,
    e.destino ? `destino ${DESTINOS[e.destino].toLowerCase()}` : "sin destino",
    e.accesible ? "accesible" : null,
    e.unidadPrincipalId ? `de la unidad ${unidades.get(e.unidadPrincipalId)}` : null,
    e.unidadPropiaId ? `es la unidad ${unidades.get(e.unidadPropiaId)}` : null,
    e.fueraDeUso ? "fuera de uso" : null,
  ]
    .filter(Boolean)
    .join(", ");

/** Crea (espacioId null) o edita un estacionamiento o bodega. */
export async function guardarEspacio(
  condominioId: string,
  espacioId: string | null,
  _: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const p = await propiedad(condominioId);
  if (!p) return NO_ENCONTRADA;
  const datos = leerEspacio(formData);
  if (!datos.success) return erroresDe(datos.error);
  const d = datos.data;

  const [agrupacionId, unidadPropiaId, unidadPrincipalId] = await Promise.all([
    deLaPropiedad("agrupacion", d.agrupacionId, condominioId),
    deLaPropiedad("unidad", d.unidadPropiaId, condominioId),
    deLaPropiedad("unidad", d.unidadPrincipalId, condominioId),
  ]);
  if (agrupacionId === false || unidadPropiaId === false || unidadPrincipalId === false) {
    return { mensaje: "Alguna agrupación o unidad elegida no es de esta propiedad." };
  }
  const revision = revisarEspacio({ regimen: d.regimen, destino: d.destino, unidadPropiaId, unidadPrincipalId });
  if (Object.keys(revision.errores).length) {
    return { errores: Object.fromEntries(Object.entries(revision.errores).map(([k, v]) => [k, [v]])) };
  }

  const repetido = await db.espacio.findFirst({
    where: { condominioId, clase: d.clase, codigo: d.codigo, ...(espacioId ? { NOT: { id: espacioId } } : {}) },
  });
  if (repetido) return { errores: { codigo: [`Ya hay un ${CLASES[d.clase].singular.toLowerCase()} con ese código.`] } };

  const unidades = new Map(
    (await db.unidad.findMany({ where: { id: { in: [unidadPropiaId, unidadPrincipalId].filter((x): x is string => !!x) } }, select: { id: true, numero: true } })).map(
      (u) => [u.id, u.numero],
    ),
  );
  const datosDb = {
    clase: d.clase,
    codigo: d.codigo,
    agrupacionId,
    ubicacion: d.ubicacion ?? null,
    regimen: d.regimen,
    destino: d.destino,
    accesible: d.accesible,
    unidadPropiaId,
    unidadPrincipalId,
    respaldo: d.respaldo ?? null,
    observaciones: d.observaciones ?? null,
  };
  const nombre = `${CLASES[d.clase].singular} ${d.codigo}`;

  if (!espacioId) {
    const nuevo = await db.espacio.create({
      data: { ...datosDb, administradoraId: p.administradoraId, condominioId, estado: d.fueraDeUso ? "FUERA_DE_USO" : "DISPONIBLE" },
    });
    await registrar(p.usuario, "Agregó un estacionamiento o bodega", `${nombre}: ${resumenEspacio(d, unidades)}`, condominioId);
    refrescar(condominioId);
    redirect(`/condominios/${condominioId}/estructura/espacios/${nuevo.id}?creado=1`);
  }

  const antes = await db.espacio.findFirst({ where: { id: espacioId, condominioId }, include: { asignaciones: true } });
  if (!antes) return { mensaje: "No encontrado." };
  const hoy = hoyDia();
  const estado = d.fueraDeUso ? "FUERA_DE_USO" : antes.asignaciones.some((a) => vigente(a, hoy)) ? "ASIGNADO" : "DISPONIBLE";
  await db.espacio.update({ where: { id: antes.id }, data: { ...datosDb, estado } });
  // El registro guarda cómo quedó, para reconstruir la historia de la condición y los vínculos.
  await registrar(p.usuario, "Modificó un estacionamiento o bodega", `${nombre}: ${resumenEspacio(d, unidades)}`, condominioId);
  refrescar(condominioId);
  return { ok: true, mensaje: "Cambios guardados." };
}

/** Elimina un espacio registrado por error. Si ya tuvo asignaciones, se deja "fuera de uso" en vez de borrarlo. */
export async function eliminarEspacio(condominioId: string, espacioId: string): Promise<EstadoForm> {
  const p = await propiedad(condominioId);
  if (!p) return NO_ENCONTRADA;
  const e = await db.espacio.findFirst({ where: { id: espacioId, condominioId }, include: { _count: { select: { asignaciones: true } } } });
  if (!e) return { mensaje: "No encontrado." };
  if (e._count.asignaciones > 0) {
    return { mensaje: "Tiene historial de asignaciones, así que no se borra. Márcalo como fuera de uso." };
  }
  await db.espacio.delete({ where: { id: e.id } });
  await registrar(p.usuario, "Eliminó un estacionamiento o bodega", `${CLASES[e.clase].singular} ${e.codigo} (sin historial)`, condominioId);
  refrescar(condominioId);
  redirect(`/condominios/${condominioId}/estructura`);
}

// ── Asignaciones de uso ────────────────────────────────────────────────────

const AsignacionSchema = z.object({
  tipo: z.enum(TipoAsignacion, { error: "Elige el tipo." }),
  unidadId: z.string().optional(),
  personaId: z.string().optional(),
  otro: z.string().max(120).optional(),
  desde: z.date({ error: "Ingresa la fecha de inicio." }),
  hasta: z.date({ error: "Fecha no válida." }).nullable(),
  respaldo: z.string().max(500).optional(),
  observaciones: z.string().max(1000).optional(),
});

const fechaValida = (f: Date | null) => !f || !Number.isNaN(f.getTime());

async function estadoSegunAsignaciones(espacioId: string) {
  const e = await db.espacio.findUnique({ where: { id: espacioId }, include: { asignaciones: true } });
  if (!e || e.estado === "FUERA_DE_USO") return;
  const hoy = hoyDia();
  const estado = e.asignaciones.some((a) => vigente(a, hoy)) ? "ASIGNADO" : "DISPONIBLE";
  if (estado !== e.estado) await db.espacio.update({ where: { id: e.id }, data: { estado } });
}

export async function asignarEspacio(
  condominioId: string,
  espacioId: string,
  _: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const p = await propiedad(condominioId);
  if (!p) return NO_ENCONTRADA;
  const desde = aFechaDia(formData.get("desde"));
  const hasta = aFechaDia(formData.get("hasta"));
  if (!fechaValida(desde) || !fechaValida(hasta)) return { mensaje: "Revisa las fechas." };
  const datos = AsignacionSchema.safeParse({
    tipo: formData.get("tipo"),
    unidadId: aTexto(formData.get("unidadId")),
    personaId: aTexto(formData.get("personaId")),
    otro: aTexto(formData.get("otro")),
    desde: desde ?? undefined,
    hasta,
    respaldo: aTexto(formData.get("respaldo")),
    observaciones: aTexto(formData.get("observaciones")),
  });
  if (!datos.success) return erroresDe(datos.error);
  const d = datos.data;
  if ([d.unidadId, d.personaId, d.otro].filter(Boolean).length !== 1) {
    return { mensaje: "Indica a quién se asigna: una unidad, una persona u otro (solo una opción)." };
  }
  if (d.tipo === "TEMPORAL" && !d.hasta) return { errores: { hasta: ["Una asignación temporal necesita fecha de término."] } };

  const unidad = d.unidadId ? await db.unidad.findFirst({ where: { id: d.unidadId, condominioId } }) : null;
  if (d.unidadId && !unidad) return { mensaje: "La unidad no es de esta propiedad." };
  const persona = d.personaId
    ? await db.persona.findFirst({ where: { id: d.personaId, administradoraId: p.administradoraId, unidades: { some: { unidad: { condominioId } } } } })
    : null;
  if (d.personaId && !persona) return { mensaje: "La persona no está vinculada a esta propiedad." };
  const beneficiario = unidad ? `Unidad ${unidad.numero}` : persona ? persona.nombre : d.otro!;

  const resultado = await db.$transaction(async (tx) => {
    // Bloquea el espacio: dos asignaciones a la vez no pueden cruzarse.
    const fila = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Espacio" WHERE id = ${espacioId} AND "condominioId" = ${condominioId} FOR UPDATE`;
    if (fila.length === 0) return { mensaje: "No encontrado." };
    const existentes = await tx.asignacionEspacio.findMany({ where: { espacioId } });
    const error = revisarAsignacion({ desde: d.desde, hasta: d.hasta }, existentes);
    if (error) return { mensaje: error };
    await tx.asignacionEspacio.create({
      data: {
        espacioId,
        tipo: d.tipo,
        unidadId: unidad?.id ?? null,
        personaId: persona?.id ?? null,
        beneficiario,
        desde: d.desde,
        hasta: d.hasta,
        respaldo: d.respaldo ?? null,
        observaciones: d.observaciones ?? null,
        creadoPor: p.usuario.nombre,
      },
    });
    return null;
  });
  if (resultado) return resultado;
  await estadoSegunAsignaciones(espacioId);
  const e = await db.espacio.findUnique({ where: { id: espacioId } });
  await registrar(
    p.usuario,
    "Asignó el uso de un estacionamiento o bodega",
    `${e ? `${CLASES[e.clase].singular} ${e.codigo}` : "Espacio"} a ${beneficiario} desde ${d.desde.toISOString().slice(0, 10)}${
      d.hasta ? ` hasta ${d.hasta.toISOString().slice(0, 10)}` : ""
    }${d.respaldo ? ` (respaldo: ${d.respaldo})` : ""}`,
    condominioId,
  );
  refrescar(condominioId);
  return { ok: true, mensaje: `Uso asignado a ${beneficiario}.` };
}

/** Termina una asignación poniéndole fecha "hasta". No se borra: queda en el historial. */
export async function terminarAsignacion(
  condominioId: string,
  asignacionId: string,
  _: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const p = await propiedad(condominioId);
  if (!p) return NO_ENCONTRADA;
  const hasta = aFechaDia(formData.get("hasta"));
  if (!hasta || Number.isNaN(hasta.getTime())) return { mensaje: "Ingresa la fecha de término." };
  const a = await db.asignacionEspacio.findFirst({ where: { id: asignacionId, espacio: { condominioId } }, include: { espacio: true } });
  if (!a) return { mensaje: "No encontrada." };
  if (a.hasta && a.hasta <= hasta) return { mensaje: "Ya termina en esa fecha o antes." };
  if (hasta < a.desde) return { mensaje: "La fecha de término es anterior a la de inicio." };
  await db.asignacionEspacio.update({
    where: { id: a.id },
    data: { hasta, terminadaPor: p.usuario.nombre, terminadaEn: new Date() },
  });
  await estadoSegunAsignaciones(a.espacioId);
  await registrar(
    p.usuario,
    "Terminó una asignación de uso",
    `${CLASES[a.espacio.clase].singular} ${a.espacio.codigo}: ${a.beneficiario} hasta ${hasta.toISOString().slice(0, 10)}`,
    condominioId,
  );
  refrescar(condominioId);
  return { ok: true, mensaje: "Asignación terminada. Queda en el historial." };
}

// ── Instalaciones ──────────────────────────────────────────────────────────

const InstalacionSchema = z.object({
  tipo: z.enum(TipoInstalacion, { error: "Elige el tipo." }),
  codigo: z.string({ error: "Ingresa el código." }).min(1, { error: "Ingresa el código." }).max(30),
  nombre: z.string({ error: "Ingresa el nombre." }).min(2, { error: "Ingresa el nombre." }).max(120),
  agrupacionId: z.string().optional(),
  ubicacion: z.string().max(200).optional(),
  descripcion: z.string().max(2000).optional(),
  estado: z.enum(EstadoInstalacion, { error: "Elige el estado." }),
  proveedorId: z.string().optional(),
  observaciones: z.string().max(2000).optional(),
});

export async function guardarInstalacion(
  condominioId: string,
  instalacionId: string | null,
  _: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const p = await propiedad(condominioId);
  if (!p) return NO_ENCONTRADA;
  const datos = InstalacionSchema.safeParse({
    tipo: formData.get("tipo"),
    codigo: aTexto(formData.get("codigo")),
    nombre: aTexto(formData.get("nombre")),
    agrupacionId: aTexto(formData.get("agrupacionId")),
    ubicacion: aTexto(formData.get("ubicacion")),
    descripcion: aTexto(formData.get("descripcion")),
    estado: formData.get("estado"),
    proveedorId: aTexto(formData.get("proveedorId")),
    observaciones: aTexto(formData.get("observaciones")),
  });
  if (!datos.success) return erroresDe(datos.error);
  const d = datos.data;
  const agrupacionId = await deLaPropiedad("agrupacion", d.agrupacionId, condominioId);
  if (agrupacionId === false) return { mensaje: "La agrupación no es de esta propiedad." };
  const proveedorId = d.proveedorId
    ? ((await db.proveedor.count({ where: { id: d.proveedorId, administradoraId: p.administradoraId } })) ? d.proveedorId : false)
    : null;
  if (proveedorId === false) return { mensaje: "Proveedor no encontrado." };
  const repetido = await db.instalacion.findFirst({
    where: { condominioId, codigo: d.codigo, ...(instalacionId ? { NOT: { id: instalacionId } } : {}) },
  });
  if (repetido) return { errores: { codigo: ["Ya hay una instalación con ese código."] } };
  const datosDb = {
    tipo: d.tipo,
    codigo: d.codigo,
    nombre: d.nombre,
    agrupacionId,
    ubicacion: d.ubicacion ?? null,
    descripcion: d.descripcion ?? null,
    estado: d.estado,
    proveedorId,
    observaciones: d.observaciones ?? null,
  };
  if (!instalacionId) {
    await db.instalacion.create({ data: { ...datosDb, administradoraId: p.administradoraId, condominioId } });
    await registrar(p.usuario, "Agregó una instalación", `${d.codigo} ${d.nombre}`, condominioId);
    refrescar(condominioId);
    redirect(`/condominios/${condominioId}/estructura#instalaciones`);
  }
  const { count } = await db.instalacion.updateMany({ where: { id: instalacionId, condominioId }, data: datosDb });
  if (count === 0) return { mensaje: "No encontrada." };
  await registrar(p.usuario, "Modificó una instalación", `${d.codigo} ${d.nombre}: ${d.estado.toLowerCase().replaceAll("_", " ")}`, condominioId);
  refrescar(condominioId);
  return { ok: true, mensaje: "Cambios guardados." };
}

export async function eliminarInstalacion(condominioId: string, instalacionId: string): Promise<EstadoForm> {
  const p = await propiedad(condominioId);
  if (!p) return NO_ENCONTRADA;
  const i = await db.instalacion.findFirst({ where: { id: instalacionId, condominioId } });
  if (!i) return { mensaje: "No encontrada." };
  await db.instalacion.delete({ where: { id: i.id } });
  await registrar(p.usuario, "Eliminó una instalación", `${i.codigo} ${i.nombre}`, condominioId);
  refrescar(condominioId);
  redirect(`/condominios/${condominioId}/estructura#instalaciones`);
}
