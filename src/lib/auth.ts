import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { decrypt, SESSION_COOKIE } from "@/lib/session";
import type { Rol } from "@/generated/prisma/enums";
import { alcanzaCondominio, esPrincipal } from "@/lib/permisos";

// Capa de acceso a datos: toda página y acción pasa por aquí para saber
// quién es el usuario y a qué administradora pertenece.

export const getUsuarioActual = cache(async () => {
  const sesion = await decrypt((await cookies()).get(SESSION_COOKIE)?.value);
  if (!sesion) return null;
  const usuario = await db.usuario.findUnique({
    where: { id: sesion.usuarioId },
    select: {
      claveActualizadaEn: true,
      activo: true,
      id: true,
      nombre: true,
      correo: true,
      rol: true,
      administradoraId: true,
      condominioId: true,
      personaId: true,
      accesoTodas: true,
      asignaciones: { select: { condominioId: true } },
      administradora: { select: { nombre: true, moneda: true } },
    },
  });
  if (!usuario) return null;
  // Al cambiar la contraseña se cierran las sesiones abiertas antes de ese momento.
  const { claveActualizadaEn, activo, asignaciones, ...datos } = usuario;
  if (!activo) return null;
  const emitida = sesion.emitidaEn ?? (sesion.iat ?? 0) * 1000;
  if (claveActualizadaEn && emitida < claveActualizadaEn.getTime()) return null;
  return { ...datos, asignados: asignaciones.map((a) => a.condominioId) };
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

/** Solo el administrador principal: crear propiedades y manejar las cuentas de la administradora. */
export async function requirePrincipal() {
  const r = await requireAdministradora();
  if (!esPrincipal(r.usuario)) redirect("/");
  return r;
}

/**
 * Comprueba que la cuenta pueda ver esa propiedad. Toda acción que recibe o encuentra
 * una propiedad, unidad, período, pago, publicación o votación pasa por aquí.
 */
export function puedeVerPropiedad(usuario: UsuarioActual, condominioId: string) {
  return alcanzaCondominio(usuario, condominioId);
}

export function puedeEditar(rol: Rol) {
  return rol === "ADMINISTRADOR";
}
