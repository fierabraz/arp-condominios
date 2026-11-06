import "server-only";
import { db } from "@/lib/db";

/**
 * Movimientos registrados de una unidad. Si tiene alguno no se puede borrar,
 * porque al borrarla se perderían sus cobros, pagos y votos.
 */
export async function historialUnidad(unidadId: string) {
  const [avisos, pagos, gastos, votos, vinculos, apertura] = await Promise.all([
    db.avisoCobro.count({ where: { unidadId } }),
    db.pago.count({ where: { unidadId } }),
    db.gasto.count({ where: { unidadId } }),
    db.voto.count({ where: { unidadId } }),
    // COM-001: vínculos ya terminados son historial de propietarios y arrendatarios.
    db.vinculoUnidad.count({ where: { unidadId, hasta: { not: null } } }),
    // COM-001 · Entrega 5: deudas o saldos a favor de la apertura.
    Promise.all([db.deudaApertura.count({ where: { unidadId } }), db.creditoApertura.count({ where: { unidadId } })]).then(([a, b]) => a + b),
  ]);
  return { avisos, pagos, gastos, votos, vinculos, apertura, total: avisos + pagos + gastos + votos + vinculos + apertura };
}
