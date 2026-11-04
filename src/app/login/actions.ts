"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, deleteSession, LOGIN, tipoDeRol, type TipoSesion } from "@/lib/session";
import { getUsuarioActual } from "@/lib/auth";
import { erroresDe, type EstadoForm } from "@/lib/forms";
import { anotarIntento, bloqueoVigente, ipCliente } from "@/lib/intentos";

const LoginSchema = z.object({
  correo: z.email({ error: "Ingresa un correo válido." }).trim().toLowerCase(),
  clave: z.string().min(1, { error: "Ingresa tu contraseña." }),
});

// Hash de relleno para comparar aunque el correo no exista y no revelar cuáles existen por el tiempo de respuesta.
const HASH_RELLENO = "$2b$10$Xf9MKAbjIl7aKrANkZe0qeNXE6xuzZUxbG4H4IEW3GzPvRwwX.qc.";

export async function iniciarSesion(tipo: TipoSesion, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const datos = LoginSchema.safeParse({
    correo: formData.get("correo"),
    clave: formData.get("clave"),
  });
  if (!datos.success) return erroresDe(datos.error);
  const { correo, clave } = datos.data;

  const ip = await ipCliente();
  const minutos = await bloqueoVigente(correo, ip);
  if (minutos > 0) {
    return {
      mensaje: `Hubo demasiados intentos fallidos. Por seguridad, espera ${minutos} ${minutos === 1 ? "minuto" : "minutos"} o recupera tu contraseña.`,
    };
  }

  const usuario = await db.usuario.findUnique({ where: { correo } });
  const valida = await bcrypt.compare(clave, usuario?.claveHash ?? HASH_RELLENO);
  if (!usuario || !valida) {
    await anotarIntento(correo, ip, false);
    return { mensaje: "Correo o contraseña incorrectos." };
  }
  await anotarIntento(correo, ip, true);
  if (!usuario.activo) return { mensaje: "Esta cuenta está desactivada. Pide a la administración que la active." };

  // Cada tipo de cuenta entra por su propia puerta.
  const tipoCuenta = tipoDeRol(usuario.rol);
  if (tipoCuenta !== tipo) {
    return tipoCuenta === "RESIDENTE"
      ? { mensaje: "Esta es una cuenta de residente. Usa el ingreso de residentes.", ok: false }
      : { mensaje: "Esta es una cuenta de administración. Usa el ingreso de administración.", ok: false };
  }

  await db.usuario.update({ where: { id: usuario.id }, data: { ultimoIngresoEn: new Date() } });
  await createSession({
    usuarioId: usuario.id,
    rol: usuario.rol,
    administradoraId: usuario.administradoraId,
  });
  redirect(tipo === "RESIDENTE" ? "/mi-cuenta" : "/");
}

export async function cerrarSesion() {
  const usuario = await getUsuarioActual();
  await deleteSession();
  redirect(usuario ? LOGIN[tipoDeRol(usuario.rol)] : LOGIN.ADMIN);
}
