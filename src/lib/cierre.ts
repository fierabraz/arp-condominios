// FIN-COMP · Entrega C · Estados del mes y reglas puras del cierre.
//
// Mes abierto → Avisos emitidos → Mes cerrado.
// - Mes abierto: se registran los gastos del mes.
// - Avisos emitidos: los cobros ya salieron; se registran pagos y se concilia el banco.
// - Mes cerrado: revisado y bloqueado. Nada con fecha de ese mes se puede agregar, cambiar ni anular.
//   Un pago que llega después se registra con su fecha real (D-FIN-08) y se aplica a la deuda
//   antigua sin alterar el cierre.

export type EstadoMes = "ABIERTO" | "EMITIDO" | "CERRADO";

export const ESTADOS_MES: Record<EstadoMes, { texto: string; tono: "alerta" | "marca" | "neutro" }> = {
  ABIERTO: { texto: "Mes abierto", tono: "alerta" },
  EMITIDO: { texto: "Avisos emitidos", tono: "marca" },
  CERRADO: { texto: "Mes cerrado", tono: "neutro" },
};

export function estadoMes(p: { estado: string; mesCerradoEn: Date | null }): EstadoMes {
  if (p.estado === "ABIERTO") return "ABIERTO";
  return p.mesCerradoEn ? "CERRADO" : "EMITIDO";
}

/** Primer y último día (UTC) del mes del período. */
export function rangoMes(anio: number, mes: number) {
  return { desde: new Date(Date.UTC(anio, mes - 1, 1)), hasta: new Date(Date.UTC(anio, mes, 0, 23, 59, 59, 999)) };
}

/** true si la fecha cae en el mes calendario anio/mes. */
export function enMes(fecha: Date, anio: number, mes: number) {
  return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() + 1 === mes;
}

export type Revision = { bloqueos: string[]; advertencias: string[] };

/** Decide qué impide cerrar y qué solo hay que confirmar. */
export function revisarCierre(d: {
  emitido: boolean;
  yaCerrado: boolean;
  anterioresSinCerrar: string[];
  movimientosSinConciliar: number;
  movimientosDelMes: number;
  transferenciasPendientes: number;
  egresosPorPagar: number;
  egresosSinRespaldo: number;
  pagosSinCartola: number;
}): Revision {
  const bloqueos: string[] = [];
  const advertencias: string[] = [];
  if (d.yaCerrado) bloqueos.push("El mes ya está cerrado.");
  if (!d.emitido) bloqueos.push("Primero hay que emitir los avisos de cobro del mes.");
  if (d.anterioresSinCerrar.length) bloqueos.push(`Cierra antes los meses anteriores: ${d.anterioresSinCerrar.join(", ")}.`);
  if (d.movimientosSinConciliar) {
    bloqueos.push(`Hay ${d.movimientosSinConciliar} movimiento(s) de la cartola del mes sin conciliar. Concílialos para que el banco cuadre con Convive.`);
  }
  if (d.movimientosDelMes === 0) advertencias.push("No hay movimientos bancarios importados de este mes: el cierre no queda comparado con el banco.");
  if (d.transferenciasPendientes) {
    advertencias.push(`${d.transferenciasPendientes} transferencia(s) informada(s) siguen pendientes de verificación. No cuentan como pagadas y seguirán pendientes después del cierre.`);
  }
  if (d.egresosPorPagar) advertencias.push(`${d.egresosPorPagar} egreso(s) del mes siguen por pagar al proveedor.`);
  if (d.egresosSinRespaldo) advertencias.push(`${d.egresosSinRespaldo} egreso(s) del mes no tienen respaldo adjunto.`);
  if (d.pagosSinCartola) advertencias.push(`${d.pagosSinCartola} pago(s) del mes no están conciliados con la cartola.`);
  return { bloqueos, advertencias };
}
