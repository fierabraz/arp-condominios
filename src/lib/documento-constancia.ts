import "server-only";
// PILOTO-001 · PDF de una versión de la constancia de pago. Se dibuja solo con los datos guardados
// de esa versión, así que la misma versión siempre dice lo mismo.

import { ANCHO, COLOR, MARGEN, generarPdf, subtitulo, tabla } from "@/lib/pdf";
import { dibujarQr } from "@/lib/qr-pdf";
import { MARCA } from "@/lib/marca";
import { formatoFecha, formatoFechaHora, formatoMoneda } from "@/lib/formato";
import {
  codigoDocumento,
  diferenciaMontos,
  ESTADO_CONSTANCIA,
  formatoFolio,
  type DatosConstancia,
} from "@/lib/constancias";

const fechaDia = (iso: string) => formatoFecha(new Date(`${iso}T00:00:00Z`));

export function pdfConstancia(d: DatosConstancia, huella: string, enlaceVerificacion: string, esVigente: boolean) {
  const estado = ESTADO_CONSTANCIA[d.estado];
  const m = (n: number) => formatoMoneda(n, d.moneda);
  return generarPdf(`Constancia ${formatoFolio(d.folio)} v${d.version}`, (doc) => {
    // Encabezado con el QR a la derecha.
    const lado = 92;
    const xQr = MARGEN + ANCHO - lado;
    const y0 = doc.y;
    dibujarQr(doc, enlaceVerificacion, xQr, y0, lado);
    doc.font("Helvetica").fontSize(8).fillColor(COLOR.suave).text("Escanea para ver el estado vigente", xQr - 10, y0 + lado + 2, { width: lado + 20, align: "center" });
    const w = ANCHO - lado - 16;
    doc.font("Helvetica").fontSize(9).fillColor(COLOR.suave).text(`${MARCA.nombre} · Constancia de pago informado`, MARGEN, y0, { width: w });
    doc.moveDown(0.3);
    doc.font("Helvetica-Bold").fontSize(18).fillColor(COLOR.texto).text(`Folio ${formatoFolio(d.folio)}`, { width: w });
    doc.moveDown(0.2);
    doc.font("Helvetica").fontSize(10).fillColor(COLOR.suave).text(`Versión ${d.version} · emitida el ${formatoFechaHora(new Date(d.emitidaEn))}`, { width: w });
    doc.text(`${d.comunidad} · Unidad ${d.unidad}`, { width: w });
    doc.y = Math.max(doc.y, y0 + lado + 16) + 8;

    // Estado destacado.
    const yE = doc.y;
    doc.roundedRect(MARGEN, yE, ANCHO, 30, 6).fill(estado.color);
    doc.font("Helvetica-Bold").fontSize(14).fillColor("#ffffff").text(estado.titulo, MARGEN, yE + 8, { width: ANCHO, align: "center" });
    doc.y = yE + 40;
    doc.font("Helvetica").fontSize(10).fillColor(COLOR.texto).text(estado.aviso, MARGEN, doc.y, { width: ANCHO });
    if (!esVigente) {
      doc.moveDown(0.4);
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#b91c1c").text("Esta no es la versión vigente de la constancia. Escanea el código QR para ver el estado actual.", { width: ANCHO });
    }
    doc.moveDown(1);

    // Datos del pago.
    subtitulo(doc, "Datos del pago");
    const dif = diferenciaMontos(d);
    const filas: [string, string][] = [
      ["Informado por", d.informante],
      ...(d.pagadoPor ? ([["Transferido por", d.pagadoPor]] as [string, string][]) : []),
      ["Fecha de la transferencia", fechaDia(d.fechaTransferencia)],
      ["Referencia o N° de operación", d.referencia ?? "No indicada"],
      ...(d.bancoOrigen ? ([["Banco de origen", d.bancoOrigen]] as [string, string][]) : []),
      ["Informado en Convive", formatoFechaHora(new Date(d.informadaEn))],
      ["Monto informado", m(d.montoInformado)],
    ];
    if (d.montoConfirmado !== null) filas.push(["Monto confirmado", m(d.montoConfirmado)]);
    if (dif !== null) filas.push(["Diferencia (confirmado menos informado)", m(dif)]);
    if (d.verificadaEn) filas.push(["Fecha de verificación", formatoFechaHora(new Date(d.verificadaEn))]);
    if (d.fechaMovimiento) filas.push(["Fecha en la cartola del banco", fechaDia(d.fechaMovimiento)]);
    tabla(
      doc,
      [
        { titulo: "Dato", ancho: ANCHO * 0.42 },
        { titulo: "Valor", ancho: ANCHO * 0.58 },
      ],
      filas.map(([a, b]) => ({ celdas: [a, b], fuerte: a.startsWith("Monto") })),
    );

    if (d.aplicaciones.length) {
      subtitulo(doc, "Obligaciones pagadas con este pago");
      tabla(
        doc,
        [
          { titulo: "Obligación", ancho: ANCHO * 0.7 },
          { titulo: "Monto aplicado", ancho: ANCHO * 0.3, alinear: "right" },
        ],
        [
          ...d.aplicaciones.map((a) => ({ celdas: [a.detalle, m(a.monto)] })),
          ...(d.saldoAFavor ? [{ celdas: ["Queda como saldo a favor de la unidad", m(d.saldoAFavor)] }] : []),
        ],
      );
    }

    if (d.nota) {
      subtitulo(doc, d.estado === "RECHAZADA" || d.estado === "ANULADA" ? "Motivo indicado por la administración" : "Observación de la administración");
      doc.font("Helvetica").fontSize(10).fillColor(COLOR.texto).text(d.nota, { width: ANCHO });
      doc.moveDown(1);
    }

    subtitulo(doc, "Historial de esta constancia");
    tabla(
      doc,
      [
        { titulo: "Versión", ancho: ANCHO * 0.15 },
        { titulo: "Estado", ancho: ANCHO * 0.5 },
        { titulo: "Emitida", ancho: ANCHO * 0.35 },
      ],
      [
        ...d.historial.map((h) => ({ celdas: [String(h.version), ESTADO_CONSTANCIA[h.estado].titulo, formatoFechaHora(new Date(h.emitidaEn))] })),
        { celdas: [String(d.version), ESTADO_CONSTANCIA[d.estado].titulo, formatoFechaHora(new Date(d.emitidaEn))], fuerte: true },
      ],
    );

    doc.font("Helvetica").fontSize(8.5).fillColor(COLOR.suave);
    doc.text(`Código del documento: ${codigoDocumento(huella)}. Consulta de autenticidad: ${enlaceVerificacion}`, { width: ANCHO });
    doc.moveDown(0.3);
    doc.text(
      "Cada cambio de estado genera una nueva versión con el mismo folio. Las versiones anteriores no se borran ni se modifican. La consulta del código QR no muestra datos personales.",
      { width: ANCHO },
    );
  });
}
