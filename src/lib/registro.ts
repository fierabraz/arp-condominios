import "server-only";
import { db } from "@/lib/db";
import type { UsuarioActual } from "@/lib/auth";
import type { Prisma } from "@/generated/prisma/client";

type Autor = Pick<UsuarioActual, "id" | "nombre" | "administradoraId">;
type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/** Lo que se anota en el registro de cambios. `antes` y `despues` nunca llevan claves ni datos de contacto. */
export type Auditoria = {
  autor: Autor;
  accion: string;
  detalle: string;
  condominioId?: string | null;
  /** Qué registro cambió: "Pago", "Periodo"... y su id. */
  entidad?: string;
  entidadId?: string;
  antes?: Prisma.InputJsonValue;
  despues?: Prisma.InputJsonValue;
};

const datosDe = (a: Auditoria) => ({
  administradoraId: a.autor.administradoraId,
  condominioId: a.condominioId ?? null,
  usuarioId: a.autor.id,
  usuarioNombre: a.autor.nombre,
  accion: a.accion,
  detalle: a.detalle.slice(0, 1000),
  entidad: a.entidad ?? null,
  entidadId: a.entidadId ?? null,
  antes: a.antes,
  despues: a.despues,
});

/**
 * SEG-25: anota el cambio dentro de la misma transacción que lo hace. Si no se puede anotar,
 * la transacción completa se deshace: no queda un pago o un cobro sin su registro.
 * Se usa para pagos y cobros.
 */
export async function registrarEn(tx: Pick<Tx, "registroCambio">, a: Auditoria) {
  await tx.registroCambio.create({ data: datosDe(a) });
}

/**
 * Guarda en el registro de cambios quién hizo qué. Se llama después de que el cambio
 * quedó hecho; si el registro falla, el cambio no se deshace (solo se informa en el log).
 * Para pagos y cobros se usa registrarEn, que va dentro de la transacción.
 */
export async function registrar(autor: Autor, accion: string, detalle: string, condominioId?: string | null) {
  try {
    await db.registroCambio.create({ data: datosDe({ autor, accion, detalle, condominioId }) });
  } catch (e) {
    console.error("No se pudo guardar el registro de cambios:", e);
  }
}
