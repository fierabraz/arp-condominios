import "server-only";
import { db } from "@/lib/db";

/**
 * Movimientos registrados de una unidad. Si tiene alguno no se puede borrar,
 * porque al borrarla se perderían sus cobros, pagos y votos.
 */
export async function historialUnidad(unidadId: string) {
  const [avisos, pagos, gastos, votos] = await Promise.all([
    db.avisoCobro.count({ where: { unidadId } }),
    db.pago.count({ where: { unidadId } }),
    db.gasto.count({ where: { unidadId } }),
    db.voto.count({ where: { unidadId } }),
  ]);
  return { avisos, pagos, gastos, votos, total: avisos + pagos + gastos + votos };
}
