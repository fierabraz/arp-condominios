// PILOTO-001 · Certificado de «unidad al día» (sección 7). Parte pura.
//
// Al día = sin obligaciones VENCIDAS impagas a la fecha de emisión. No es lo mismo que saldo cero:
// la unidad puede tener un aviso emitido que todavía no vence y estar al día igual.
// Los pagos pendientes de verificación NO cuentan como pagados.

export type AvisoParaCertificar = { saldo: number; vencimiento: Date };

export type EvaluacionAlDia =
  | { alDia: true; porVencer: number; proximoVencimiento: Date | null }
  | { alDia: false; motivo: string; vencida: number };

export function evaluarAlDia(avisos: AvisoParaCertificar[], ahora: Date, pendientesVerificacion = 0): EvaluacionAlDia {
  if (avisos.length === 0) {
    return { alDia: false, motivo: "La unidad no tiene avisos de cobro emitidos: todavía no hay obligaciones que certificar.", vencida: 0 };
  }
  const conSaldo = avisos.filter((a) => a.saldo > 0.004);
  const vencidos = conSaldo.filter((a) => a.vencimiento < ahora);
  const vencida = Math.round(vencidos.reduce((s, a) => s + a.saldo, 0) * 100) / 100;
  if (vencida > 0) {
    const extra =
      pendientesVerificacion > 0
        ? " Tiene pagos informados pendientes de verificación: verifícalos con la cartola antes de volver a intentarlo."
        : "";
    return { alDia: false, motivo: `La unidad tiene obligaciones vencidas impagas (${vencidos.length}).${extra}`, vencida };
  }
  const porVencer = Math.round(conSaldo.reduce((s, a) => s + a.saldo, 0) * 100) / 100;
  const proximo = conSaldo.map((a) => a.vencimiento).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  return { alDia: true, porVencer, proximoVencimiento: proximo };
}

/** Contenido fijo del certificado (el PDF se dibuja solo con esto). Sin nombres ni RUT. */
export type DatosCertificado = {
  folio: number;
  comunidad: string;
  direccion: string;
  unidad: string;
  moneda: string;
  emitidoEn: string; // ISO
  emitidoPor: string;
  porVencer: number;
  proximoVencimiento: string | null; // AAAA-MM-DD
  ultimoPeriodo: string | null; // «Octubre 2026»
  aFavor: number;
  pendientesVerificacion: number;
};

export const formatoFolioCertificado = (folio: number) => `CAD-${String(folio).padStart(6, "0")}`;
