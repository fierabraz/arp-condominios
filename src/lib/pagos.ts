// PAG-001 · Portal de pagos del residente. Reglas puras (sin base de datos) para poder probarlas:
// datos bancarios publicables, referencia sugerida, RUT, estados de una transferencia informada
// y búsqueda de movimientos de la cartola que podrían corresponder a una transferencia.

import { MESES } from "@/lib/cobro";
import type { EstadoTransferencia } from "@/generated/prisma/enums";

// ---------------------------------------------------------------------------
// Estados de una transferencia informada

export const ESTADOS_TRANSFERENCIA: Record<
  EstadoTransferencia,
  { texto: string; tono: "neutro" | "alerta" | "exito" | "peligro"; residente: string }
> = {
  INFORMADA: {
    texto: "Informada",
    tono: "neutro",
    residente: "Pendiente de verificación por la administración.",
  },
  EN_REVISION: {
    texto: "Pendiente de revisión",
    tono: "alerta",
    residente: "La administración la está revisando. Todavía no se descuenta de tu deuda.",
  },
  CONCILIADA: {
    texto: "Verificada y conciliada",
    tono: "exito",
    residente: "La administración la verificó en la cartola del banco y la registró como pago.",
  },
  RECHAZADA: {
    texto: "Rechazada o con diferencias",
    tono: "peligro",
    residente: "La administración no pudo verificarla. Revisa el motivo y, si corresponde, infórmala de nuevo.",
  },
};

/** Estados en los que la administración todavía puede decidir algo. */
export const ESTADOS_ABIERTOS: EstadoTransferencia[] = ["INFORMADA", "EN_REVISION"];

// ---------------------------------------------------------------------------
// RUT chileno

export const normalizarRut = (s: string) => s.replace(/[.\s-]/g, "").toUpperCase();

/** true si el RUT tiene su dígito verificador correcto (módulo 11). */
export function rutValido(rut: string) {
  const r = normalizarRut(rut);
  if (!/^\d{7,8}[\dK]$/.test(r)) return false;
  const cuerpo = r.slice(0, -1);
  let suma = 0;
  let factor = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  const dv = resto === 11 ? "0" : resto === 10 ? "K" : String(resto);
  return dv === r.slice(-1);
}

/** 12345678K → 12.345.678-K */
export function formatoRut(rut: string) {
  const r = normalizarRut(rut);
  if (r.length < 2) return rut;
  const cuerpo = r.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${cuerpo}-${r.slice(-1)}`;
}

// ---------------------------------------------------------------------------
// Datos para transferir

export const soloDigitos = (s: string) => s.replace(/\D/g, "");

export type DatosCuentaPago = {
  banco: string;
  tipo: string;
  numeroFinal: string;
  numeroCuenta: string | null;
  titular: string | null;
  rutTitular: string | null;
  correoPagos: string | null;
  recibePagos: boolean;
  verificadaEn: Date | null;
  activa: boolean;
};

/** Qué falta para que los residentes puedan transferir a esta cuenta. Vacío = completa. */
export function faltantesCuentaPago(c: DatosCuentaPago): string[] {
  const faltan: string[] = [];
  if (!c.numeroCuenta) faltan.push("número de cuenta completo");
  else if (!soloDigitos(c.numeroCuenta).endsWith(c.numeroFinal)) faltan.push("número de cuenta que termine en " + c.numeroFinal);
  if (!c.titular) faltan.push("titular");
  if (!c.rutTitular || !rutValido(c.rutTitular)) faltan.push("RUT del titular");
  if (c.tipo === "CAJA") faltan.push("tipo de cuenta bancaria");
  return faltan;
}

/**
 * Se muestra a los residentes solo si está activa, marcada para recibir pagos, completa y
 * verificada. Si no, el portal no muestra datos (nunca datos a medias ni inventados).
 */
export function cuentaPublicable(c: DatosCuentaPago) {
  return c.activa && c.recibePagos && c.verificadaEn !== null && faltantesCuentaPago(c).length === 0;
}

const MESES_CORTOS = MESES.map((m) => m.slice(0, 3).toUpperCase());

/**
 * Referencia sugerida para el comentario de la transferencia: corta (los bancos permiten pocos
 * caracteres), sin datos personales y fácil de reconocer en la cartola. Ej.: "GC 101 NOV-26".
 */
export function referenciaSugerida(unidadNumero: string, periodo?: { anio: number; mes: number } | null) {
  const unidad = unidadNumero.replace(/\s+/g, "").toUpperCase().slice(0, 12);
  if (!periodo) return `GC ${unidad}`;
  return `GC ${unidad} ${MESES_CORTOS[periodo.mes - 1]}-${String(periodo.anio % 100).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Enlace de pago del aviso (QR)

/** Código del QR: 32 caracteres hexadecimales aleatorios (ver AvisoCobro.codigoPago). */
export const CODIGO_PAGO = /^[0-9a-f]{32}$/;

/** Después de ingresar solo se vuelve a un enlace de pago de Convive (nunca a otro sitio). */
export function volverPermitido(ruta: unknown): string | null {
  if (typeof ruta !== "string") return null;
  const m = /^\/pagar\/([0-9a-f]{32})$/.exec(ruta);
  return m ? ruta : null;
}

// ---------------------------------------------------------------------------
// Coincidencias con la cartola (FIN-003.1)

export type MovimientoCandidato = {
  id: string;
  fecha: Date;
  monto: number; // abono, en pesos
  montoConciliado: number;
  descripcion: string | null;
  referencia: string | null;
  contraparte: string | null;
};

export type Coincidencia = MovimientoCandidato & {
  restante: number;
  dias: number;
  puntos: number;
  motivos: string[];
  nivel: "fuerte" | "posible";
};

/** Días de diferencia aceptados entre la fecha informada y la de la cartola. */
export const DIAS_TOLERANCIA = 7;

const diasEntre = (a: Date, b: Date) => Math.round(Math.abs(a.getTime() - b.getTime()) / 86_400_000);

/**
 * Movimientos de la cartola que podrían ser la transferencia informada: abonos con saldo sin
 * conciliar, de fecha cercana. Solo PROPONE: la administración siempre elige y confirma.
 * `ambigua` = hay más de una coincidencia fuerte, o ninguna clara.
 */
export function buscarCoincidencias(
  t: { fecha: Date; monto: number; operacion: string | null },
  movimientos: MovimientoCandidato[],
) {
  const operacion = t.operacion ? soloDigitos(t.operacion) : "";
  const lista: Coincidencia[] = [];
  for (const m of movimientos) {
    const restante = Math.round((m.monto - m.montoConciliado) * 100) / 100;
    if (m.monto <= 0 || restante <= 0) continue;
    const dias = diasEntre(t.fecha, m.fecha);
    if (dias > DIAS_TOLERANCIA) continue;
    let puntos = 0;
    const motivos: string[] = [];
    if (restante === t.monto) {
      puntos += 50;
      motivos.push("mismo monto");
    } else if (restante > t.monto) {
      puntos += 10;
      motivos.push("monto mayor (podría cubrir varias cosas)");
    } else {
      motivos.push("monto menor al informado");
    }
    if (dias === 0) {
      puntos += 30;
      motivos.push("misma fecha");
    } else if (dias <= 2) {
      puntos += 20;
      motivos.push(`${dias} día${dias === 1 ? "" : "s"} de diferencia`);
    } else {
      puntos += 5;
      motivos.push(`${dias} días de diferencia`);
    }
    if (operacion.length >= 4) {
      const texto = soloDigitos(`${m.referencia ?? ""} ${m.descripcion ?? ""}`);
      if (texto.includes(operacion)) {
        puntos += 40;
        motivos.push("número de operación en la cartola");
      }
    }
    lista.push({ ...m, restante, dias, puntos, motivos, nivel: puntos >= 80 ? "fuerte" : "posible" });
  }
  lista.sort((a, b) => b.puntos - a.puntos || a.dias - b.dias || a.fecha.getTime() - b.fecha.getTime());
  const fuertes = lista.filter((c) => c.nivel === "fuerte").length;
  return { coincidencias: lista, ambigua: fuertes !== 1 };
}

// ---------------------------------------------------------------------------
// Comprobante

export const COMPROBANTE_TAMANO_MAXIMO = 900 * 1024; // bajo el límite de 1 MB de las acciones
export const COMPROBANTE_TIPOS: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/webp": "WEBP",
};

/** Reconoce el tipo real del archivo por sus primeros bytes (no por el nombre). */
export function tipoComprobante(b: Uint8Array): string | null {
  const empieza = (...x: number[]) => x.every((v, i) => b[i] === v);
  if (empieza(0x25, 0x50, 0x44, 0x46)) return "application/pdf"; // %PDF
  if (empieza(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (empieza(0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (empieza(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}
