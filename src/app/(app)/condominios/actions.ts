"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { puedeVerPropiedad, requireAdministradora, requirePrincipal } from "@/lib/auth";
import { esPrincipal, filtroPersonas } from "@/lib/permisos";
import { aFechaDia, aNumero, aTexto, erroresDe, type EstadoForm } from "@/lib/forms";
import { EstadoComunidad, ModalidadIncorporacion, TipoComunidad, TipoUnidad, TipoVinculo } from "@/generated/prisma/enums";
import { ESTADOS, revisarCambio } from "@/lib/configuracion";
import { datosDeUna } from "@/lib/configuracion-servicio";
import { registrar } from "@/lib/registro";
import { historialUnidad } from "@/lib/unidades";
import { TIPOS_VINCULO } from "@/lib/vinculos";
import { crearVinculo, terminarVinculo } from "@/lib/vinculos-servicio";

const CondominioSchema = z.object({
  nombre: z.string({ error: "Ingresa el nombre." }).min(2, { error: "Ingresa el nombre." }),
  direccion: z.string({ error: "Ingresa la dirección." }).min(3, { error: "Ingresa la dirección." }),
  comuna: z.string().optional(),
  rut: z.string().optional(),
  porcentajeReserva: z
    .number({ error: "Ingresa un número." })
    .min(0, { error: "No puede ser negativo." })
    .max(100, { error: "Máximo 100." }),
  tasaInteresMora: z
    .number({ error: "Ingresa un número." })
    .min(0, { error: "No puede ser negativo." })
    .max(100, { error: "Máximo 100." }),
  diaVencimiento: z
    .number({ error: "Ingresa un día." })
    .int()
    .min(1, { error: "Entre 1 y 28." })
    .max(28, { error: "Entre 1 y 28." }),
  totalUnidades: z
    .number({ error: "Ingresa un número entero." })
    .int({ error: "Ingresa un número entero." })
    .min(1, { error: "Debe ser al menos 1." })
    .max(10000, { error: "Máximo 10.000." })
    .nullable(),
  // COM-001: identificación. Todo opcional para poder guardar a medias y seguir después.
  tipo: z.enum(TipoComunidad, { error: "Elige un tipo." }).nullable(),
  modalidad: z.enum(ModalidadIncorporacion, { error: "Elige una opción." }).nullable(),
  region: z.string().max(80).optional(),
  fechaIncorporacion: z
    .date({ error: "Fecha no válida." })
    .min(new Date("1900-01-01"), { error: "Fecha no válida." })
    .max(new Date("2100-01-01"), { error: "Fecha no válida." })
    .nullable(),
  reglamento: z.string().max(2000, { error: "Máximo 2.000 caracteres." }).optional(),
  observaciones: z.string().max(4000, { error: "Máximo 4.000 caracteres." }).optional(),
});

function leerCondominio(formData: FormData) {
  return CondominioSchema.safeParse({
    nombre: aTexto(formData.get("nombre")),
    direccion: aTexto(formData.get("direccion")),
    comuna: aTexto(formData.get("comuna")),
    rut: aTexto(formData.get("rut")),
    porcentajeReserva: aNumero(formData.get("porcentajeReserva")) ?? 5,
    tasaInteresMora: aNumero(formData.get("tasaInteresMora")) ?? 0,
    diaVencimiento: aNumero(formData.get("diaVencimiento")) ?? 10,
    totalUnidades: aNumero(formData.get("totalUnidades")) ?? null,
    tipo: aTexto(formData.get("tipo")) ?? null,
    modalidad: aTexto(formData.get("modalidad")) ?? null,
    region: aTexto(formData.get("region")),
    fechaIncorporacion: aFechaDia(formData.get("fechaIncorporacion")),
    reglamento: aTexto(formData.get("reglamento")),
    observaciones: aTexto(formData.get("observaciones")),
  });
}

/** Los campos de texto vacíos se guardan como null (para poder borrar un dato). */
function paraGuardar(d: z.infer<typeof CondominioSchema>) {
  return {
    ...d,
    comuna: d.comuna ?? null,
    rut: d.rut ?? null,
    region: d.region ?? null,
    reglamento: d.reglamento ?? null,
    observaciones: d.observaciones ?? null,
  };
}

export async function crearCondominio(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  // Solo el administrador principal crea propiedades (los demás solo ven las que les asignan).
  const { usuario, administradoraId } = await requirePrincipal();
  const datos = leerCondominio(formData);
  if (!datos.success) return erroresDe(datos.error);

  // Nace "En configuración" (valor por defecto de la tabla): se completa en el configurador.
  const condominio = await db.condominio.create({ data: { ...paraGuardar(datos.data), administradoraId } });
  await registrar(usuario, "Creó una propiedad", `${condominio.nombre} (en configuración)`, condominio.id);
  redirect(`/condominios/${condominio.id}/configuracion?creada=1`);
}

export async function editarCondominio(
  id: string,
  _: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const { usuario, administradoraId } = await requireAdministradora();
  const datos = leerCondominio(formData);
  if (!datos.success) return erroresDe(datos.error);
  if (!puedeVerPropiedad(usuario, id)) return { mensaje: "Condominio no encontrado." };

  const { count } = await db.condominio.updateMany({
    where: { id, administradoraId },
    data: paraGuardar(datos.data),
  });
  if (count === 0) return { mensaje: "Condominio no encontrado." };
  await registrar(
    usuario,
    "Cambió la configuración de una propiedad",
    `${datos.data.nombre}: fondo de reserva ${datos.data.porcentajeReserva} %, interés por mora ${datos.data.tasaInteresMora} %, vence el día ${datos.data.diaVencimiento}, ${datos.data.totalUnidades ?? "sin indicar"} unidades en total`,
    id,
  );
  revalidatePath(`/condominios/${id}`, "layout");
  redirect(formData.get("volver") === "configuracion" ? `/condominios/${id}/configuracion?guardado=1` : `/condominios/${id}`);
}

/**
 * COM-001: cambia el estado de la comunidad (en configuración / habilitada administrativa /
 * habilitada financieramente). Revisa los requisitos con los datos de este momento.
 * Lo financiero (habilitar o deshabilitar cobros) lo decide solo el administrador principal.
 */
export async function cambiarEstadoComunidad(id: string, destino: EstadoComunidad): Promise<EstadoForm> {
  const { usuario, administradoraId } = await requireAdministradora();
  if (!puedeVerPropiedad(usuario, id)) return { mensaje: "Propiedad no encontrada." };
  if (!Object.keys(ESTADOS).includes(destino)) return { mensaje: "Estado no válido." };
  const datos = await datosDeUna(administradoraId, id);
  if (!datos) return { mensaje: "Propiedad no encontrada." };
  const tocaFinanzas = destino === "HABILITADA_FINANCIERA" || datos.estado === "HABILITADA_FINANCIERA";
  if (tocaFinanzas && !esPrincipal(usuario)) {
    return { mensaje: "Solo el administrador principal puede habilitar o deshabilitar los cobros de una propiedad." };
  }
  const revision = revisarCambio(datos, destino);
  if (!revision.ok) return { mensaje: revision.bloqueos.join(" ") };

  // Solo cambia si sigue en el estado que se revisó (evita dos cambios cruzados).
  const { count } = await db.condominio.updateMany({
    where: { id, administradoraId, estado: datos.estado },
    data: { estado: destino, estadoCambiadoEn: new Date() },
  });
  if (count === 0) return { mensaje: "La propiedad cambió mientras tanto. Recarga la página." };
  await registrar(
    usuario,
    "Cambió el estado de una propiedad",
    `${datos.nombre}: de "${ESTADOS[datos.estado].texto}" a "${ESTADOS[destino].texto}".${
      revision.advertencias.length ? ` Advertencias aceptadas: ${revision.advertencias.join(" ")}` : ""
    }`,
    id,
  );
  revalidatePath(`/condominios/${id}`, "layout");
  revalidatePath("/condominios");
  return { ok: true, mensaje: `Ahora está ${ESTADOS[destino].texto.toLowerCase()}.` };
}

const UnidadSchema = z.object({
  numero: z.string({ error: "Ingresa el número." }).min(1, { error: "Ingresa el número." }),
  tipo: z.enum(TipoUnidad, { error: "Elige un tipo." }),
  alicuota: z
    .number({ error: "Ingresa la alícuota." })
    .gt(0, { error: "Debe ser mayor que 0." })
    .max(100, { error: "Máximo 100." }),
});

function leerUnidad(formData: FormData) {
  return UnidadSchema.safeParse({
    numero: aTexto(formData.get("numero")),
    tipo: formData.get("tipo"),
    alicuota: aNumero(formData.get("alicuota")),
  });
}

/**
 * Torre, sector o piso elegido en el formulario (COM-001). undefined si el formulario no trae el
 * campo (no se toca), null si se dejó vacío, false si no es de esta propiedad.
 */
async function leerAgrupacion(formData: FormData, condominioId: string): Promise<string | null | undefined | false> {
  if (!formData.has("agrupacionId")) return undefined;
  const id = aTexto(formData.get("agrupacionId"));
  if (!id) return null;
  return (await db.agrupacion.count({ where: { id, condominioId } })) ? id : false;
}

export async function crearUnidad(
  condominioId: string,
  _: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const { usuario, administradoraId } = await requireAdministradora();
  const datos = leerUnidad(formData);
  if (!datos.success) return erroresDe(datos.error);

  const condominio = await db.condominio.findFirst({ where: { id: condominioId, administradoraId } });
  if (!condominio || !puedeVerPropiedad(usuario, condominioId)) return { mensaje: "Condominio no encontrado." };

  const existe = await db.unidad.findUnique({
    where: { condominioId_numero: { condominioId, numero: datos.data.numero } },
  });
  if (existe) return { errores: { numero: ["Ya existe una unidad con ese número."] } };
  const agrupacionId = await leerAgrupacion(formData, condominioId);
  if (agrupacionId === false) return { errores: { agrupacionId: ["Elige una agrupación de esta propiedad."] } };

  await db.unidad.create({ data: { ...datos.data, agrupacionId, condominioId, administradoraId } });
  await registrar(usuario, "Agregó una unidad", `Unidad ${datos.data.numero}, alícuota ${datos.data.alicuota} %`, condominioId);
  revalidatePath(`/condominios/${condominioId}`, "layout");
  return { ok: true, mensaje: `Unidad ${datos.data.numero} agregada.` };
}

export async function editarUnidad(
  unidadId: string,
  _: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const { usuario, administradoraId } = await requireAdministradora();
  const datos = leerUnidad(formData);
  if (!datos.success) return erroresDe(datos.error);

  const unidad = await db.unidad.findFirst({ where: { id: unidadId, administradoraId } });
  if (!unidad || !puedeVerPropiedad(usuario, unidad.condominioId)) return { mensaje: "Unidad no encontrada." };

  const repetida = await db.unidad.findFirst({
    where: { condominioId: unidad.condominioId, numero: datos.data.numero, NOT: { id: unidadId } },
  });
  if (repetida) return { errores: { numero: ["Ya existe una unidad con ese número."] } };
  const agrupacionId = await leerAgrupacion(formData, unidad.condominioId);
  if (agrupacionId === false) return { errores: { agrupacionId: ["Elige una agrupación de esta propiedad."] } };

  await db.unidad.update({ where: { id: unidadId }, data: { ...datos.data, agrupacionId } });
  await registrar(
    usuario,
    "Editó una unidad",
    `Unidad ${unidad.numero}${unidad.numero !== datos.data.numero ? ` (ahora ${datos.data.numero})` : ""}: alícuota ${unidad.alicuota.toString()} % → ${datos.data.alicuota} %`,
    unidad.condominioId,
  );
  revalidatePath(`/condominios/${unidad.condominioId}`, "layout");
  return { ok: true, mensaje: "Cambios guardados." };
}

export async function eliminarUnidad(unidadId: string) {
  const { usuario, administradoraId } = await requireAdministradora();
  const unidad = await db.unidad.findFirst({ where: { id: unidadId, administradoraId } });
  if (!unidad || !puedeVerPropiedad(usuario, unidad.condominioId)) return;
  // Una unidad con cobros, pagos, cargos o votos no se borra: se perdería su historia.
  if ((await historialUnidad(unidadId)).total > 0) return;
  await db.unidad.delete({ where: { id: unidadId } });
  await registrar(usuario, "Borró una unidad", `Unidad ${unidad.numero}`, unidad.condominioId);
  revalidatePath(`/condominios/${unidad.condominioId}`, "layout");
  redirect(`/condominios/${unidad.condominioId}/unidades`);
}

const VinculoSchema = z.object({
  personaId: z.string({ error: "Elige una persona." }).min(1, { error: "Elige una persona." }),
  tipo: z.enum(TipoVinculo, { error: "Elige el vínculo." }),
  desde: z.date({ error: "Ingresa la fecha de inicio." }),
  terminoPrevisto: z.date().nullable(),
  respaldo: z.string().max(500).optional(),
  observaciones: z.string().max(1000).optional(),
});

const diaTxt = (f: Date) => f.toISOString().slice(0, 10);

/** COM-001 · Entrega 3: vincula una persona a una unidad con fecha de inicio. Queda en el historial. */
export async function vincularPersona(
  unidadId: string,
  _: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const { usuario, administradoraId } = await requireAdministradora();
  const desde = aFechaDia(formData.get("desde"));
  const terminoPrevisto = aFechaDia(formData.get("terminoPrevisto"));
  if ((desde && Number.isNaN(desde.getTime())) || (terminoPrevisto && Number.isNaN(terminoPrevisto.getTime()))) {
    return { mensaje: "Revisa las fechas." };
  }
  const datos = VinculoSchema.safeParse({
    personaId: aTexto(formData.get("personaId")),
    tipo: formData.get("tipo"),
    desde: desde ?? undefined,
    terminoPrevisto,
    respaldo: aTexto(formData.get("respaldo")),
    observaciones: aTexto(formData.get("observaciones")),
  });
  if (!datos.success) return erroresDe(datos.error);
  const d = datos.data;

  const [unidad, persona] = await Promise.all([
    db.unidad.findFirst({ where: { id: unidadId, administradoraId } }),
    db.persona.findFirst({ where: { id: d.personaId, administradoraId, ...filtroPersonas(usuario) } }),
  ]);
  if (!unidad || !persona || !puedeVerPropiedad(usuario, unidad.condominioId)) return { mensaje: "Unidad o persona no encontrada." };

  const error = await db.$transaction((tx) =>
    crearVinculo(tx, { administradoraId, unidadId, ...d, personaId: persona.id, creadoPor: usuario.nombre }),
  );
  if (error) return { mensaje: error };
  await registrar(
    usuario,
    "Vinculó una persona a una unidad",
    `Unidad ${unidad.numero}: ${persona.nombre} como ${TIPOS_VINCULO[d.tipo].texto.toLowerCase()} desde ${diaTxt(d.desde)}${
      d.terminoPrevisto ? `, término previsto ${diaTxt(d.terminoPrevisto)}` : ""
    }${d.respaldo ? ` (respaldo: ${d.respaldo})` : ""}`,
    unidad.condominioId,
  );
  revalidatePath(`/condominios/${unidad.condominioId}`, "layout");
  return { ok: true, mensaje: `${persona.nombre} vinculado como ${TIPOS_VINCULO[d.tipo].texto.toLowerCase()}.` };
}

/** Termina un vínculo (venta, fin del arriendo, mudanza). No se borra: queda en el historial. */
export async function terminarVinculoPersona(
  unidadId: string,
  vinculoId: string,
  _: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const { usuario, administradoraId } = await requireAdministradora();
  const hasta = aFechaDia(formData.get("hasta"));
  if (!hasta || Number.isNaN(hasta.getTime())) return { mensaje: "Ingresa la fecha de término." };
  const v = await db.vinculoUnidad.findFirst({
    where: { id: vinculoId, unidadId, administradoraId },
    include: { unidad: true, persona: { select: { nombre: true } } },
  });
  if (!v || !puedeVerPropiedad(usuario, v.unidad.condominioId)) return { mensaje: "No encontrado." };
  const error = await db.$transaction((tx) => terminarVinculo(tx, v.id, hasta, usuario.nombre));
  if (error) return { mensaje: error };
  await registrar(
    usuario,
    "Terminó el vínculo de una persona con una unidad",
    `Unidad ${v.unidad.numero}: ${v.persona.nombre} como ${TIPOS_VINCULO[v.tipo].texto.toLowerCase()} hasta ${diaTxt(hasta)}`,
    v.unidad.condominioId,
  );
  revalidatePath(`/condominios/${v.unidad.condominioId}`, "layout");
  return { ok: true, mensaje: "Vínculo terminado. Queda en el historial." };
}
