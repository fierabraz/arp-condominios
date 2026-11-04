import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { Rol } from "@/generated/prisma/enums";

/** Dos tipos de sesión: la de quienes administran (administración, comité, plataforma) y la de residentes. */
export type TipoSesion = "ADMIN" | "RESIDENTE";

export type SessionPayload = {
  usuarioId: string;
  rol: Rol;
  administradoraId: string | null;
  tipo: TipoSesion;
  expiresAt: string;
  iat?: number;
};

export function tipoDeRol(rol: Rol): TipoSesion {
  return rol === "RESIDENTE" ? "RESIDENTE" : "ADMIN";
}

/** Página de ingreso de cada tipo de sesión. */
export const LOGIN: Record<TipoSesion, string> = { ADMIN: "/login", RESIDENTE: "/login/residentes" };

const COOKIE = "sesion";
// La sesión de administración maneja dinero y datos de todos, por eso dura menos.
const DURACION: Record<TipoSesion, { ms: number; jwt: string }> = {
  ADMIN: { ms: 12 * 60 * 60 * 1000, jwt: "12h" },
  RESIDENTE: { ms: 30 * 24 * 60 * 60 * 1000, jwt: "30d" },
};
let clave: Uint8Array | undefined;

// Se valida al usarla (no al importar) para que la compilación no exija el secreto.
function claveSesion() {
  if (!clave) {
    const secreto = process.env.SESSION_SECRET ?? "";
    if (secreto.length < 32) {
      throw new Error("SESSION_SECRET debe tener al menos 32 caracteres. Revisa las variables de entorno.");
    }
    clave = new TextEncoder().encode(secreto);
  }
  return clave;
}

export async function encrypt(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(DURACION[payload.tipo].jwt)
    .sign(claveSesion());
}

export async function decrypt(token: string | undefined) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify<SessionPayload>(token, claveSesion(), {
      algorithms: ["HS256"],
    });
    // Sesiones creadas antes de separar los tipos: el tipo sale del rol.
    return { ...payload, tipo: payload.tipo ?? tipoDeRol(payload.rol) };
  } catch {
    return null;
  }
}

export async function createSession(data: Omit<SessionPayload, "expiresAt" | "tipo" | "iat">) {
  const tipo = tipoDeRol(data.rol);
  const expiresAt = new Date(Date.now() + DURACION[tipo].ms);
  const token = await encrypt({ ...data, tipo, expiresAt: expiresAt.toISOString() });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    sameSite: "lax",
    path: "/",
  });
}

export async function deleteSession() {
  (await cookies()).delete(COOKIE);
}

export const SESSION_COOKIE = COOKIE;
