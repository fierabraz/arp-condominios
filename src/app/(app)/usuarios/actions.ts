"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdministradora } from "@/lib/auth";
import { aTexto, erroresDe, type EstadoForm } from "@/lib/forms";
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
  const { administradoraId } = await requireAdministradora();
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
    },
  });
  revalidatePath("/usuarios");
  return { ok: true, mensaje: `Cuenta creada para ${resto.nombre}.` };
}

export async function eliminarUsuario(id: string) {
  const { usuario, administradoraId } = await requireAdministradora();
  if (id === usuario.id) return; // no borrarse a sí mismo
  await db.usuario.deleteMany({ where: { id, administradoraId } });
  revalidatePath("/usuarios");
}
