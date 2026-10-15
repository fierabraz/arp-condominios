"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUsuario } from "@/lib/auth";
import { aTexto, erroresDe, type EstadoForm } from "@/lib/forms";
import { ClaveSchema } from "@/lib/usuarios";

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
  await db.usuario.update({
    where: { id: usuario.id },
    data: { claveHash: await bcrypt.hash(datos.data.nueva, 10) },
  });
  return { ok: true, mensaje: "Contraseña actualizada." };
}
