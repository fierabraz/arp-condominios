import "server-only";
import { db } from "@/lib/db";

/**
 * Movimientos registrados de una unidad. Si tiene alguno no se puede borrar,
 * porque al borrarla se perderían sus cobros, pagos y votos.
 */
export async function historialUnidad(unidadId: string) {
  const [avisos, pagos, gastos, votos, vinculos] = await Promise.all([
    db.avisoCobro.count({ where: { unidadId } }),
    db.pago.count({ where: { unidadId } }),
    db.gasto.count({ where: { unidadId } }),
    db.voto.count({ where: { unidadId } }),
    // COM-001: vínculos ya terminados son historial de propietarios y arrendatarios.
    db.vinculoUnidad.count({ where: { unidadId, hasta: { not: null } } }),
  ]);
  return { avisos, pagos, gastos, votos, vinculos, total: avisos + pagos + gastos + votos + vinculos };
}
