// Cálculo del cobro mensual. Funciones puras, sin base de datos, para poder probarlas.
// Todos los montos se manejan en unidades mínimas enteras (pesos, o centavos si la
// moneda tiene decimales) para evitar errores de redondeo.

export function decimalesMoneda(moneda: string) {
  return ["CLP", "PYG", "JPY", "KRW"].includes(moneda) ? 0 : 2;
}

export function aMinimo(monto: number | string, decimales: number) {
  return Math.round(Number(monto) * 10 ** decimales);
}

export function deMinimo(minimo: number, decimales: number) {
  return minimo / 10 ** decimales;
}

/**
 * Reparte un total entero entre partes según su peso, de modo que la suma del
 * reparto sea exactamente el total (método del mayor resto).
 */
export function repartir(total: number, pesos: number[]): number[] {
  const sumaPesos = pesos.reduce((a, b) => a + b, 0);
  if (sumaPesos === 0) return pesos.map(() => 0);
  const exactos = pesos.map((p) => (total * p) / sumaPesos);
  const base = exactos.map(Math.floor);
  let resto = total - base.reduce((a, b) => a + b, 0);
  const orden = exactos
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of orden) {
    if (resto <= 0) break;
    base[i] += 1;
    resto -= 1;
  }
  return base;
}

export type UnidadCobro = {
  id: string;
  alicuota: number; // porcentaje, ej. 1.25
  cargosIndividuales: number; // en unidades mínimas
  deudaVencida: number; // en unidades mínimas
};

export type LineaAviso = {
  unidadId: string;
  gastoComun: number;
  fondoReserva: number;
  cargos: number;
  interes: number;
  total: number;
};

export const TOLERANCIA_ALICUOTA = 0.0001;

export function alicuotasCuadran(alicuotas: number[]) {
  return Math.abs(alicuotas.reduce((a, b) => a + b, 0) - 100) < TOLERANCIA_ALICUOTA;
}

/**
 * Calcula el aviso de cobro de cada unidad:
 * gasto común × alícuota + fondo de reserva + cargos individuales + interés por mora.
 */
export function calcularAvisos({
  totalGastosComunes,
  porcentajeReserva,
  tasaInteresMora,
  unidades,
}: {
  totalGastosComunes: number; // unidades mínimas
  porcentajeReserva: number; // ej. 5
  tasaInteresMora: number; // % mensual, ej. 1.5
  unidades: UnidadCobro[];
}): LineaAviso[] {
  if (!alicuotasCuadran(unidades.map((u) => u.alicuota))) {
    throw new Error("Las alícuotas del condominio deben sumar 100 %.");
  }
  const pesos = unidades.map((u) => u.alicuota);
  const totalReserva = Math.round((totalGastosComunes * porcentajeReserva) / 100);
  const comun = repartir(totalGastosComunes, pesos);
  const reserva = repartir(totalReserva, pesos);

  return unidades.map((u, i) => {
    const interes = Math.round((Math.max(u.deudaVencida, 0) * tasaInteresMora) / 100);
    const total = comun[i] + reserva[i] + u.cargosIndividuales + interes;
    return {
      unidadId: u.id,
      gastoComun: comun[i],
      fondoReserva: reserva[i],
      cargos: u.cargosIndividuales,
      interes,
      total,
    };
  });
}

export type AvisoPendiente = { id: string; saldo: number };

/**
 * Aplica un monto a los avisos pendientes, del más antiguo al más nuevo.
 * Devuelve cuánto se aplica a cada aviso y lo que sobra (saldo a favor).
 */
export function aplicarPago(monto: number, pendientes: AvisoPendiente[]) {
  let disponible = monto;
  const aplicaciones: { avisoId: string; monto: number }[] = [];
  for (const aviso of pendientes) {
    if (disponible <= 0) break;
    if (aviso.saldo <= 0) continue;
    const aplicado = Math.min(disponible, aviso.saldo);
    aplicaciones.push({ avisoId: aviso.id, monto: aplicado });
    disponible -= aplicado;
  }
  return { aplicaciones, sobrante: disponible };
}

/** Fecha de vencimiento: el día indicado del mes siguiente al período. */
export function fechaVencimiento(anio: number, mes: number, dia: number) {
  return new Date(Date.UTC(mes === 12 ? anio + 1 : anio, mes === 12 ? 0 : mes, dia, 12));
}

export const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

export function nombrePeriodo(anio: number, mes: number) {
  const m = MESES[mes - 1];
  return `${m.charAt(0).toUpperCase()}${m.slice(1)} ${anio}`;
}
