"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUsuario } from "@/lib/auth";
import { aTexto, erroresDe, type EstadoForm } from "@/lib/forms";
import { ClaveSchema } from "@/lib/usuarios";
import { registrar } from "@/lib/registro";
import { createSession } from "@/lib/session";

const CambioSchema = z
  .object({
    actual: z.string({ error: "Ingresa tu contraseña actual." }).min(1, { error: "Ingresa tu contraseña actual." }),
    nueva: ClaveSchema,
    repetir: z.string({ error: "Repite la nueva contraseña." }),
  })
  .refine((d) => d.nueva === d.repetir, { error: "Las contraseñas no coinciden.", path: ["repetir"] })
  .refine((d) => d.nueva !== d.actual, { error: "La nueva contraseña debe ser distinta.", path: ["nueva"] });

export async function cambiarClave(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const usuario = await requireUsuario();
  const datos = CambioSchema.safeParse({
    actual: aTexto(formData.get("actual")),
    nueva: aTexto(formData.get("nueva")),
    repetir: aTexto(formData.get("repetir")),
  });
  if (!datos.success) return erroresDe(datos.error);

  const { claveHash } = await db.usuario.findUniqueOrThrow({ where: { id: usuario.id }, select: { claveHash: true } });
  if (!(await bcrypt.compare(datos.data.actual, claveHash))) {
    return { errores: { actual: ["La contraseña actual no es correcta."] } };
  }
  // claveActualizadaEn cierra las sesiones abiertas en otros equipos; esta se renueva.
  await db.usuario.update({
    where: { id: usuario.id },
    data: { claveHash: await bcrypt.hash(datos.data.nueva, 10), claveActualizadaEn: new Date() },
  });
  await createSession({ usuarioId: usuario.id, rol: usuario.rol, administradoraId: usuario.administradoraId });
  await registrar(usuario, "Cambió su contraseña", usuario.correo);
  return { ok: true, mensaje: "Contraseña actualizada. Se cerró la sesión en tus otros equipos." };
}

const DatosSchema = z.object({
  nombre: z.string({ error: "Ingresa tu nombre." }).min(3, { error: "Ingresa tu nombre y apellido." }).max(120),
  telefono: z
    .string()
    .max(30)
    .regex(/^[+\d\s()-]{8,}$/, { error: "Escribe un teléfono válido, ej. +56 9 1234 5678." })
    .optional(),
});

/** PILOTO-001: cada cuenta de administración cambia su nombre y teléfono. El correo y el rol no. */
export async function guardarDatos(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const usuario = await requireUsuario();
  const d = DatosSchema.safeParse({ nombre: aTexto(formData.get("nombre")), telefono: aTexto(formData.get("telefono")) });
  if (!d.success) return erroresDe(d.error);
  await db.usuario.update({ where: { id: usuario.id }, data: { nombre: d.data.nombre, telefono: d.data.telefono ?? null } });
  await registrar(usuario, "Actualizó sus datos personales", d.data.nombre);
  return { ok: true, mensaje: "Datos guardados." };
}
