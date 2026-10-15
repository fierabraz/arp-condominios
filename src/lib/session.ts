import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { Rol } from "@/generated/prisma/enums";

export type SessionPayload = {
  usuarioId: string;
  rol: Rol;
  administradoraId: string | null;
  expiresAt: string;
};

const COOKIE = "sesion";
const DURACION_MS = 7 * 24 * 60 * 60 * 1000;
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
    .setExpirationTime("7d")
    .sign(claveSesion());
}

export async function decrypt(token: string | undefined) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify<SessionPayload>(token, claveSesion(), {
      algorithms: ["HS256"],
    });
    return payload;
  } catch {
    return null;
  }
}

export async function createSession(data: Omit<SessionPayload, "expiresAt">) {
  const expiresAt = new Date(Date.now() + DURACION_MS);
  const token = await encrypt({ ...data, expiresAt: expiresAt.toISOString() });
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
