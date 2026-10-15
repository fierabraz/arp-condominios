"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, deleteSession } from "@/lib/session";
import { erroresDe, type EstadoForm } from "@/lib/forms";

const LoginSchema = z.object({
  correo: z.email({ error: "Ingresa un correo válido." }).trim().toLowerCase(),
  clave: z.string().min(1, { error: "Ingresa tu contraseña." }),
});

export async function iniciarSesion(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const datos = LoginSchema.safeParse({
    correo: formData.get("correo"),
    clave: formData.get("clave"),
  });
  if (!datos.success) return erroresDe(datos.error);

  const usuario = await db.usuario.findUnique({ where: { correo: datos.data.correo } });
  const valida = usuario && (await bcrypt.compare(datos.data.clave, usuario.claveHash));
  if (!usuario || !valida) return { mensaje: "Correo o contraseña incorrectos." };

  await createSession({
    usuarioId: usuario.id,
    rol: usuario.rol,
    administradoraId: usuario.administradoraId,
  });
  redirect("/");
}

export async function cerrarSesion() {
  await deleteSession();
  redirect("/login");
}
