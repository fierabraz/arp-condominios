import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";

export const MINUTOS_VALIDEZ = 60;
/** Solicitudes de enlace permitidas por cuenta en una hora. */
export const SOLICITUDES_POR_HORA = 3;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Crea un enlace de un solo uso; devuelve el token en claro (solo va en el correo). */
export async function crearToken(usuarioId: string) {
  const token = randomBytes(32).toString("base64url");
  await db.tokenRecuperacion.create({
    data: { usuarioId, tokenHash: hashToken(token), expiraEn: new Date(Date.now() + MINUTOS_VALIDEZ * 60_000) },
  });
  return token;
}

/** Token vigente (no usado ni vencido) con su usuario, o null. */
export async function tokenVigente(token: string) {
  const t = await db.tokenRecuperacion.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { usuario: { select: { id: true, nombre: true, rol: true, administradoraId: true, correo: true } } },
  });
  if (!t || t.usadoEn || t.expiraEn < new Date()) return null;
  return t;
}
