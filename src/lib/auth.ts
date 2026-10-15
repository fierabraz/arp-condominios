import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { decrypt, SESSION_COOKIE } from "@/lib/session";
import type { Rol } from "@/generated/prisma/enums";

// Capa de acceso a datos: toda página y acción pasa por aquí para saber
// quién es el usuario y a qué administradora pertenece.

export const getUsuarioActual = cache(async () => {
  const sesion = await decrypt((await cookies()).get(SESSION_COOKIE)?.value);
  if (!sesion) return null;
  return db.usuario.findUnique({
    where: { id: sesion.usuarioId },
    select: {
      id: true,
      nombre: true,
      correo: true,
      rol: true,
      administradoraId: true,
      condominioId: true,
      personaId: true,
      administradora: { select: { nombre: true, moneda: true } },
    },
  });
});

export type UsuarioActual = NonNullable<Awaited<ReturnType<typeof getUsuarioActual>>>;

export async function requireUsuario(roles?: Rol[]) {
  const usuario = await getUsuarioActual();
  // Sesión válida pero usuario borrado: limpiar la cookie.
  if (!usuario) redirect("/salir");
  if (roles && !roles.includes(usuario.rol)) redirect("/");
  return usuario;
}

/** Usuario que trabaja dentro de una administradora; devuelve su id para filtrar consultas. */
export async function requireAdministradora(roles: Rol[] = ["ADMINISTRADOR"]) {
  const usuario = await requireUsuario(roles);
  if (!usuario.administradoraId) redirect("/");
  return { usuario, administradoraId: usuario.administradoraId };
}

export function puedeEditar(rol: Rol) {
  return rol === "ADMINISTRADOR";
}
