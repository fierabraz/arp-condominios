"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdministradora, requireUsuario } from "@/lib/auth";
import { aTexto, erroresDe, type EstadoForm } from "@/lib/forms";
import { finDelDiaChile, formatoFecha, hoyChile } from "@/lib/formato";
import { ErrorVotacion, emitirVoto, unidadesConVoto } from "@/lib/votaciones-servicio";

const VotacionSchema = z.object({
  titulo: z.string({ error: "Ingresa el nombre." }).min(3, { error: "Ingresa el nombre." }).max(150),
  descripcion: z.string().max(5000).optional(),
  ponderacion: z.enum(["ALICUOTA", "UNIDAD"], { error: "Elige cómo se cuentan los votos." }),
  cierra: z
    .string({ error: "Elige la fecha de término." })
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Elige la fecha de término." })
    .refine((f) => f >= hoyChile(), { error: "La fecha de término no puede ser pasada." }),
  opciones: z
    .array(z.string().max(120))
    .transform((o) => o.map((x) => x.trim()).filter(Boolean))
    .refine((o) => o.length >= 2, { error: "Escribe al menos dos opciones." })
    .refine((o) => new Set(o.map((x) => x.toLowerCase())).size === o.length, { error: "Hay opciones repetidas." }),
});

const rutaVotaciones = (condominioId: string) => `/condominios/${condominioId}/votaciones`;

export async function crearVotacion(condominioId: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const { administradoraId } = await requireAdministradora();
  const datos = VotacionSchema.safeParse({
    titulo: aTexto(formData.get("titulo")),
    descripcion: aTexto(formData.get("descripcion")),
    ponderacion: formData.get("ponderacion"),
    cierra: aTexto(formData.get("cierra")),
    opciones: formData.getAll("opcion").map(String),
  });
  if (!datos.success) return erroresDe(datos.error);
  if (!(await db.condominio.findFirst({ where: { id: condominioId, administradoraId } }))) {
    return { mensaje: "Propiedad no encontrada." };
  }
  const { opciones, cierra, ...resto } = datos.data;
  const v = await db.votacion.create({
    data: {
      ...resto,
      administradoraId,
      condominioId,
      cierraEn: finDelDiaChile(cierra),
      opciones: { create: opciones.map((texto, orden) => ({ texto, orden })) },
    },
  });
  revalidatePath(rutaVotaciones(condominioId), "layout");
  redirect(`${rutaVotaciones(condominioId)}/${v.id}`);
}

async function votacionPropia(id: string) {
  const { usuario, administradoraId } = await requireAdministradora();
  const v = await db.votacion.findFirst({ where: { id, administradoraId } });
  return { usuario, v };
}

/** Abre la votación a los propietarios y la anuncia en el muro de la propiedad. */
export async function publicarVotacion(id: string) {
  const { usuario, v } = await votacionPropia(id);
  if (!v || v.estado !== "BORRADOR") return;
  await db.$transaction([
    db.votacion.update({ where: { id }, data: { estado: "ABIERTA", publicadaEn: new Date() } }),
    db.publicacion.create({
      data: {
        administradoraId: v.administradoraId,
        condominioId: v.condominioId,
        autor: usuario.nombre,
        titulo: `Votación: ${v.titulo}`,
        contenido: `${v.descripcion ? `${v.descripcion}\n\n` : ""}Los propietarios pueden votar desde su cuenta, una vez por unidad, hasta el ${formatoFecha(v.cierraEn)} a las 23:59.`,
      },
    }),
  ]);
  revalidatePath(`/condominios/${v.condominioId}`, "layout");
}

export async function cerrarVotacion(id: string) {
  const { v } = await votacionPropia(id);
  if (!v || v.estado !== "ABIERTA") return;
  await db.votacion.update({ where: { id }, data: { estado: "CERRADA", cerradaEn: new Date() } });
  revalidatePath(rutaVotaciones(v.condominioId), "layout");
}

export async function eliminarVotacion(id: string) {
  const { v } = await votacionPropia(id);
  // Solo se borran las que nadie ha visto; las publicadas quedan como registro.
  if (!v || v.estado !== "BORRADOR") return;
  await db.votacion.delete({ where: { id } });
  revalidatePath(rutaVotaciones(v.condominioId), "layout");
  redirect(rutaVotaciones(v.condominioId));
}

/** La administración registra el voto de una unidad, por ejemplo en una asamblea presencial. */
export async function registrarVotoPresencial(votacionId: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const { usuario, v } = await votacionPropia(votacionId);
  if (!v) return { mensaje: "Votación no encontrada." };
  const unidadId = aTexto(formData.get("unidadId"));
  const opcionId = aTexto(formData.get("opcionId"));
  if (!unidadId) return { errores: { unidadId: ["Elige la unidad."] } };
  if (!opcionId) return { errores: { opcionId: ["Elige una opción."] } };
  try {
    await emitirVoto({ votacionId, opcionId, unidadId, emitidoPor: usuario.nombre, presencial: true });
  } catch (e) {
    if (e instanceof ErrorVotacion) return { mensaje: e.message };
    throw e;
  }
  revalidatePath(rutaVotaciones(v.condominioId), "layout");
  return { ok: true, mensaje: "Voto registrado." };
}

/** Un propietario vota por una de sus unidades desde su cuenta. */
export async function votar(votacionId: string, unidadId: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const usuario = await requireUsuario(["RESIDENTE"]);
  const opcionId = aTexto(formData.get("opcionId"));
  if (!opcionId) return { mensaje: "Elige una opción." };
  const v = await db.votacion.findFirst({ where: { id: votacionId, administradoraId: usuario.administradoraId ?? "" } });
  if (!v || !usuario.personaId) return { mensaje: "Votación no encontrada." };
  const propias = await unidadesConVoto(usuario.personaId, v.condominioId);
  if (!propias.some((u) => u.id === unidadId)) return { mensaje: "Solo los propietarios de la unidad pueden votar." };
  try {
    await emitirVoto({ votacionId, opcionId, unidadId, emitidoPor: usuario.nombre, presencial: false });
  } catch (e) {
    if (e instanceof ErrorVotacion) return { mensaje: e.message };
    throw e;
  }
  revalidatePath("/mi-cuenta");
  revalidatePath(rutaVotaciones(v.condominioId), "layout");
  return { ok: true, mensaje: "¡Gracias! Tu voto quedó registrado." };
}
