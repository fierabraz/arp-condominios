// PILOTO-001 · Constancia de pago informado (sección 6). Parte pura: contenido de cada versión,
// cuándo corresponde una versión nueva y cómo se muestra el folio.
//
// Reglas:
// - Un folio por transferencia informada; nunca cambia.
// - Cada cambio de estado (o de monto confirmado, obligaciones pagadas o motivo) agrega una
//   versión nueva. Las anteriores quedan tal cual (la base de datos impide modificarlas).
// - Mientras no esté verificada, la constancia dice que NO acredita que el dinero se recibió.

import { createHash } from "node:crypto";

export type EstadoConstancia = "INFORMADA" | "EN_REVISION" | "CONCILIADA" | "RECHAZADA" | "ANULADA";

/** Contenido completo de una versión. El PDF se dibuja solo con esto. */
export type DatosConstancia = {
  folio: number;
  version: number;
  estado: EstadoConstancia;
  comunidad: string;
  unidad: string;
  informante: string;
  pagadoPor: string | null;
  moneda: string;
  montoInformado: number;
  montoConfirmado: number | null;
  fechaTransferencia: string; // AAAA-MM-DD
  referencia: string | null;
  bancoOrigen: string | null;
  informadaEn: string; // ISO
  emitidaEn: string; // ISO
  verificadaEn: string | null; // ISO
  fechaMovimiento: string | null; // AAAA-MM-DD, del movimiento de la cartola
  aplicaciones: { detalle: string; monto: number }[];
  saldoAFavor: number | null;
  nota: string | null;
  historial: { version: number; estado: EstadoConstancia; emitidaEn: string }[];
};

/** Texto del estado tal como va en el documento (los mismos nombres que en todo Convive). */
export const ESTADO_CONSTANCIA: Record<EstadoConstancia, { titulo: string; aviso: string; color: string }> = {
  INFORMADA: {
    titulo: "PENDIENTE DE VERIFICACIÓN",
    aviso:
      "Esta constancia acredita que el pago fue INFORMADO a la administración. Todavía NO acredita que el dinero haya sido recibido por la comunidad: eso se confirma al revisar la cartola del banco.",
    color: "#b45309",
  },
  EN_REVISION: {
    titulo: "EN REVISIÓN",
    aviso: "La administración está revisando este pago. Todavía NO acredita que el dinero haya sido recibido por la comunidad.",
    color: "#b45309",
  },
  CONCILIADA: {
    titulo: "VERIFICADO Y CONCILIADO",
    aviso: "La administración verificó este pago con la cartola del banco y lo aplicó al estado de cuenta de la unidad.",
    color: "#047857",
  },
  RECHAZADA: {
    titulo: "RECHAZADO O CON DIFERENCIAS",
    aviso: "La administración no pudo verificar este pago tal como se informó. Revisa el motivo indicado abajo.",
    color: "#b91c1c",
  },
  ANULADA: {
    titulo: "ANULADO O REVERSADO",
    aviso: "El pago fue anulado o reversado por la administración. Las versiones anteriores de esta constancia quedan en el historial, pero ya no representan el estado vigente.",
    color: "#4b5563",
  },
};

export const formatoFolio = (folio: number) => `CP-${String(folio).padStart(6, "0")}`;

/** Lo que, si cambia, justifica una versión nueva. */
export function claveVersion(d: Pick<DatosConstancia, "estado" | "montoConfirmado" | "aplicaciones" | "nota" | "saldoAFavor">) {
  return JSON.stringify([d.estado, d.montoConfirmado, d.aplicaciones.map((a) => [a.detalle, a.monto]), d.saldoAFavor, d.nota ?? null]);
}

/** Huella SHA-256 del contenido: el «código del documento» impreso en el PDF. */
export function huellaConstancia(d: DatosConstancia) {
  return createHash("sha256").update(JSON.stringify(d)).digest("hex");
}

/** Código corto legible de la huella (16 caracteres en 4 grupos). */
export const codigoDocumento = (huella: string) => huella.slice(0, 16).toUpperCase().match(/.{4}/g)!.join("-");

/** Diferencia entre lo informado y lo confirmado, o null si no hay. */
export function diferenciaMontos(d: Pick<DatosConstancia, "montoInformado" | "montoConfirmado">) {
  if (d.montoConfirmado === null) return null;
  const dif = Math.round((d.montoConfirmado - d.montoInformado) * 100) / 100;
  return dif === 0 ? null : dif;
}
