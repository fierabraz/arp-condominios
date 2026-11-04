import "server-only";
import { db } from "@/lib/db";
import type { UsuarioActual } from "@/lib/auth";

type Autor = Pick<UsuarioActual, "id" | "nombre" | "administradoraId">;

/**
 * Guarda en el registro de cambios quién hizo qué. Se llama después de que el cambio
 * quedó hecho; si el registro falla, el cambio no se deshace (solo se informa en el log).
 */
export async function registrar(autor: Autor, accion: string, detalle: string, condominioId?: string | null) {
  try {
    await db.registroCambio.create({
      data: {
        administradoraId: autor.administradoraId,
        condominioId: condominioId ?? null,
        usuarioId: autor.id,
        usuarioNombre: autor.nombre,
        accion,
        detalle: detalle.slice(0, 1000),
      },
    });
  } catch (e) {
    console.error("No se pudo guardar el registro de cambios:", e);
  }
}
