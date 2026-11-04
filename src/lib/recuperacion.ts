import "server-only";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import type { TipoToken } from "@/generated/prisma/enums";

export const MINUTOS_VALIDEZ = 60;
/** Días que dura una invitación: el residente puede tardar en verla. */
export const DIAS_INVITACION = 7;
/** Solicitudes de enlace permitidas por cuenta en una hora. */
export const SOLICITUDES_POR_HORA = 3;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const VALIDEZ_MS: Record<TipoToken, number> = {
  RECUPERACION: MINUTOS_VALIDEZ * 60_000,
  INVITACION: DIAS_INVITACION * 24 * 3_600_000,
};

/** Crea un enlace de un solo uso; devuelve el token en claro (solo va en el correo o al administrador). */
export async function crearToken(usuarioId: string, tipo: TipoToken = "RECUPERACION") {
  const token = randomBytes(32).toString("base64url");
  await db.tokenRecuperacion.create({
    data: { usuarioId, tipo, tokenHash: hashToken(token), expiraEn: new Date(Date.now() + VALIDEZ_MS[tipo]) },
  });
  return token;
}

/** Token vigente (no usado ni vencido) del tipo pedido, con su usuario, o null. */
export async function tokenVigente(token: string, tipo: TipoToken = "RECUPERACION") {
  const t = await db.tokenRecuperacion.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      usuario: { select: { id: true, nombre: true, rol: true, administradoraId: true, correo: true, activo: true } },
    },
  });
  if (!t || t.tipo !== tipo || t.usadoEn || t.expiraEn < new Date() || !t.usuario.activo) return null;
  return t;
}

/**
 * Usa el enlace para guardar la contraseña nueva. Devuelve el usuario, o null si el enlace
 * ya se usó o venció. El enlace se marca como usado antes de cambiar nada, para que dos
 * pestañas no puedan usarlo a la vez.
 */
export async function canjearToken(token: string, tipo: TipoToken, claveNueva: string) {
  const t = await tokenVigente(token, tipo);
  if (!t) return null;
  const ahora = new Date();
  const { count } = await db.tokenRecuperacion.updateMany({
    where: { tokenHash: hashToken(token), usadoEn: null },
    data: { usadoEn: ahora },
  });
  if (count === 0) return null;
  await db.$transaction([
    // claveActualizadaEn cierra las sesiones que estuvieran abiertas con la contraseña anterior.
    db.usuario.update({
      where: { id: t.usuarioId },
      data: { claveHash: await bcrypt.hash(claveNueva, 10), claveActualizadaEn: ahora },
    }),
    // Los demás enlaces pendientes de esa cuenta dejan de servir.
    db.tokenRecuperacion.updateMany({ where: { usuarioId: t.usuarioId, usadoEn: null }, data: { usadoEn: ahora } }),
  ]);
  return t.usuario;
}
