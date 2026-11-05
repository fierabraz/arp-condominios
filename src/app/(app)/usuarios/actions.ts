"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePrincipal } from "@/lib/auth";
import { aTexto, erroresDe, type EstadoForm } from "@/lib/forms";
import { registrar } from "@/lib/registro";
import { ETIQUETAS_ROL } from "@/lib/formato";
import { ClaveSchema, CorreoSchema } from "@/lib/usuarios";

const UsuarioSchema = z
  .object({
    nombre: z.string({ error: "Ingresa el nombre." }).min(2, { error: "Ingresa el nombre." }),
    correo: CorreoSchema,
    clave: ClaveSchema,
    rol: z.enum(["ADMINISTRADOR", "COMITE", "RESIDENTE"], { error: "Elige un rol." }),
    condominioId: z.string().optional(),
    personaId: z.string().optional(),
  })
  .refine((d) => d.rol !== "COMITE" || d.condominioId, {
    error: "Elige el condominio que verá el comité.",
    path: ["condominioId"],
  })
  .refine((d) => d.rol !== "RESIDENTE" || d.personaId, {
    error: "Elige la persona a la que corresponde esta cuenta.",
    path: ["personaId"],
  });

export async function crearUsuario(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const { usuario, administradoraId } = await requirePrincipal();
  const datos = UsuarioSchema.safeParse({
    nombre: aTexto(formData.get("nombre")),
    correo: aTexto(formData.get("correo")),
    clave: aTexto(formData.get("clave")),
    rol: formData.get("rol"),
    condominioId: aTexto(formData.get("condominioId")),
    personaId: aTexto(formData.get("personaId")),
  });
  if (!datos.success) return erroresDe(datos.error);
  const { clave, rol, condominioId, personaId, ...resto } = datos.data;
  const acceso = await leerAcceso(formData, administradoraId);
  if (rol === "ADMINISTRADOR" && "error" in acceso) return { errores: { asignados: [acceso.error] } };

  if (await db.usuario.findUnique({ where: { correo: resto.correo } })) {
    return { errores: { correo: ["Ese correo ya tiene una cuenta."] } };
  }
  // Verificar que el condominio o la persona sean de esta administradora.
  if (rol === "COMITE" && !(await db.condominio.findFirst({ where: { id: condominioId, administradoraId } }))) {
    return { mensaje: "Condominio no encontrado." };
  }
  if (rol === "RESIDENTE") {
    if (!(await db.persona.findFirst({ where: { id: personaId, administradoraId } }))) {
      return { mensaje: "Persona no encontrada." };
    }
    if (await db.usuario.findUnique({ where: { personaId } })) {
      return { errores: { personaId: ["Esa persona ya tiene una cuenta."] } };
    }
  }

  await db.usuario.create({
    data: {
      ...resto,
      rol,
      administradoraId,
      claveHash: await bcrypt.hash(clave, 10),
      condominioId: rol === "COMITE" ? condominioId : null,
      personaId: rol === "RESIDENTE" ? personaId : null,
      ...(rol === "ADMINISTRADOR" && !("error" in acceso)
        ? {
            accesoTodas: acceso.todas,
            asignaciones: { create: acceso.ids.map((id) => ({ condominioId: id })) },
          }
        : {}),
    },
  });
  await registrar(
    usuario,
    "Creó una cuenta de acceso",
    `${resto.nombre} (${resto.correo}) como ${ETIQUETAS_ROL[rol].toLowerCase()}${
      rol === "ADMINISTRADOR" && !("error" in acceso) ? `: ${await textoAcceso(acceso, administradoraId)}` : ""
    }`,
  );
  revalidatePath("/usuarios");
  return { ok: true, mensaje: `Cuenta creada para ${resto.nombre}.` };
}

export async function eliminarUsuario(id: string) {
  const { usuario, administradoraId } = await requirePrincipal();
  if (id === usuario.id) return; // no borrarse a sí mismo
  const borrado = await db.usuario.findFirst({ where: { id, administradoraId }, select: { nombre: true, correo: true } });
  if (!borrado) return;
  await db.usuario.deleteMany({ where: { id, administradoraId } });
  await registrar(usuario, "Borró una cuenta de acceso", `${borrado.nombre} (${borrado.correo})`);
  revalidatePath("/usuarios");
}

/**
 * Lee del formulario el alcance de un administrador: "todas" (principal) o la lista de
 * propiedades asignadas. Solo acepta propiedades de la misma administradora.
 */
type Acceso = { todas: boolean; ids: string[] };

async function leerAcceso(formData: FormData, administradoraId: string): Promise<Acceso | { error: string }> {
  const todas = formData.get("accesoTodas") === "si";
  const pedidas = [...new Set(formData.getAll("asignados").map(String).filter(Boolean))];
  const ids = todas
    ? []
    : (await db.condominio.findMany({ where: { administradoraId, id: { in: pedidas } }, select: { id: true } })).map((c) => c.id);
  if (!todas && ids.length === 0) return { error: "Elige al menos una propiedad, o marca que vea todas." };
  return { todas, ids };
}

async function textoAcceso(acceso: Acceso, administradoraId: string) {
  if (acceso.todas) return "principal, ve todas las propiedades";
  const nombres = await db.condominio.findMany({
    where: { administradoraId, id: { in: acceso.ids } },
    select: { nombre: true },
    orderBy: { nombre: "asc" },
  });
  return `ve ${nombres.map((n) => n.nombre).join(", ")}`;
}

/** Cambia qué propiedades ve un administrador. Siempre debe quedar al menos un principal. */
export async function guardarAcceso(usuarioId: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const { usuario, administradoraId } = await requirePrincipal();
  const cuenta = await db.usuario.findFirst({
    where: { id: usuarioId, administradoraId, rol: "ADMINISTRADOR" },
    select: { id: true, nombre: true, accesoTodas: true },
  });
  if (!cuenta) return { mensaje: "Cuenta no encontrada." };
  const acceso = await leerAcceso(formData, administradoraId);
  if ("error" in acceso) return { mensaje: acceso.error };
  if (cuenta.id === usuario.id && !acceso.todas) {
    return { mensaje: "No puedes quitarte a ti mismo el acceso a todas las propiedades. Pídeselo a otro administrador principal." };
  }

  await db.$transaction([
    db.usuario.update({ where: { id: cuenta.id }, data: { accesoTodas: acceso.todas } }),
    db.asignacionCondominio.deleteMany({ where: { usuarioId: cuenta.id } }),
    db.asignacionCondominio.createMany({ data: acceso.ids.map((id) => ({ usuarioId: cuenta.id, condominioId: id })) }),
  ]);
  await registrar(usuario, "Cambió el acceso de un administrador", `${cuenta.nombre}: ${await textoAcceso(acceso, administradoraId)}`);
  revalidatePath("/usuarios");
  return { ok: true, mensaje: "Acceso guardado." };
}
