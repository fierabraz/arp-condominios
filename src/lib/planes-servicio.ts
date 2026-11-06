import "server-only";
import { db } from "@/lib/db";
import { calcularCupo } from "@/lib/planes";

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/** SUS-001: cupo de comunidades de una administradora, leído de la base. */
export async function cupoDe(administradoraId: string, cliente: Pick<Tx, "administradora" | "condominio"> = db) {
  const [a, usadas] = await Promise.all([
    cliente.administradora.findUnique({
      where: { id: administradoraId },
      select: { creaComunidades: true, plan: { select: { nombre: true, maxComunidades: true } } },
    }),
    cliente.condominio.count({ where: { administradoraId } }),
  ]);
  return calcularCupo({ creaComunidades: a?.creaComunidades ?? false, plan: a?.plan ?? null }, usadas);
}

export class SinCupoError extends Error {}

/**
 * Crea la comunidad solo si queda cupo. La revisión y la creación van en la misma transacción
 * y con la fila de la administradora bloqueada: dos pestañas a la vez no pueden pasarse del límite.
 */
export async function crearDentroDelCupo<T>(administradoraId: string, crear: (tx: Tx) => Promise<T>): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Administradora" WHERE id = ${administradoraId} FOR UPDATE`;
    const cupo = await cupoDe(administradoraId, tx);
    if (!cupo.puede) throw new SinCupoError(cupo.motivo ?? "No puedes crear más comunidades.");
    return crear(tx);
  });
}
