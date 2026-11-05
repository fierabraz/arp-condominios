"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { puedeVerPropiedad, requireAdministradora, requirePrincipal } from "@/lib/auth";
import { filtroPersonas } from "@/lib/permisos";
import { aNumero, aTexto, erroresDe, type EstadoForm } from "@/lib/forms";
import { RelacionUnidad, TipoUnidad } from "@/generated/prisma/enums";
import { ETIQUETAS_RELACION } from "@/lib/formato";
import { registrar } from "@/lib/registro";
import { historialUnidad } from "@/lib/unidades";

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
  });
}

export async function crearCondominio(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  // Solo el administrador principal crea propiedades (los demás solo ven las que les asignan).
  const { usuario, administradoraId } = await requirePrincipal();
  const datos = leerCondominio(formData);
  if (!datos.success) return erroresDe(datos.error);

  const condominio = await db.condominio.create({ data: { ...datos.data, administradoraId } });
  await registrar(usuario, "Creó una propiedad", condominio.nombre, condominio.id);
  redirect(`/condominios/${condominio.id}`);
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
    data: datos.data,
  });
  if (count === 0) return { mensaje: "Condominio no encontrado." };
  await registrar(
    usuario,
    "Cambió la configuración de una propiedad",
    `${datos.data.nombre}: fondo de reserva ${datos.data.porcentajeReserva} %, interés por mora ${datos.data.tasaInteresMora} %, vence el día ${datos.data.diaVencimiento}, ${datos.data.totalUnidades ?? "sin indicar"} unidades en total`,
    id,
  );
  revalidatePath(`/condominios/${id}`, "layout");
  redirect(`/condominios/${id}`);
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

  await db.unidad.create({ data: { ...datos.data, condominioId, administradoraId } });
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

  await db.unidad.update({ where: { id: unidadId }, data: datos.data });
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
  relacion: z.enum(RelacionUnidad, { error: "Elige la relación." }),
});

export async function vincularPersona(
  unidadId: string,
  _: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const { usuario, administradoraId } = await requireAdministradora();
  const datos = VinculoSchema.safeParse({
    personaId: aTexto(formData.get("personaId")),
    relacion: formData.get("relacion"),
  });
  if (!datos.success) return erroresDe(datos.error);

  const [unidad, persona] = await Promise.all([
    db.unidad.findFirst({ where: { id: unidadId, administradoraId } }),
    db.persona.findFirst({ where: { id: datos.data.personaId, administradoraId, ...filtroPersonas(usuario) } }),
  ]);
  if (!unidad || !persona || !puedeVerPropiedad(usuario, unidad.condominioId)) return { mensaje: "Unidad o persona no encontrada." };

  await db.unidadPersona.upsert({
    where: { unidadId_personaId_relacion: { unidadId, ...datos.data } },
    create: { unidadId, ...datos.data },
    update: {},
  });
  await registrar(
    usuario,
    "Vinculó una persona a una unidad",
    `${persona.nombre} como ${ETIQUETAS_RELACION[datos.data.relacion].toLowerCase()} de la unidad ${unidad.numero}`,
    unidad.condominioId,
  );
  revalidatePath(`/condominios/${unidad.condominioId}/unidades/${unidadId}`);
  return { ok: true, mensaje: `${persona.nombre} vinculado.` };
}

export async function desvincularPersona(unidadId: string, personaId: string, relacion: RelacionUnidad) {
  const { usuario, administradoraId } = await requireAdministradora();
  const unidad = await db.unidad.findFirst({ where: { id: unidadId, administradoraId } });
  if (!unidad || !puedeVerPropiedad(usuario, unidad.condominioId)) return;
  const persona = await db.persona.findFirst({ where: { id: personaId, administradoraId }, select: { nombre: true } });
  const { count } = await db.unidadPersona.deleteMany({ where: { unidadId, personaId, relacion } });
  if (count > 0) {
    await registrar(
      usuario,
      "Desvinculó una persona de una unidad",
      `${persona?.nombre ?? "Persona"} como ${ETIQUETAS_RELACION[relacion].toLowerCase()} de la unidad ${unidad.numero}`,
      unidad.condominioId,
    );
  }
  revalidatePath(`/condominios/${unidad.condominioId}/unidades/${unidadId}`);
}
