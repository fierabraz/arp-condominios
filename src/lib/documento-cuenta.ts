import "server-only";
// PILOTO-001 · Estado de cuenta de una unidad en PDF y certificado de «unidad al día» (sección 7).
// El estado de cuenta usa `estadoCuenta`, la misma fuente que Recaudación y que la pantalla.

import { ANCHO, cifras, COLOR, encabezado, generarPdf, MARGEN, subtitulo, tabla } from "@/lib/pdf";
import { dibujarQr } from "@/lib/qr-pdf";
import { MARCA } from "@/lib/marca";
import { nombrePeriodo } from "@/lib/cobro";
import { formatoFecha, formatoFechaHora, formatoMoneda, ETIQUETAS_MEDIO_PAGO } from "@/lib/formato";
import { MENSAJE_PAGO_PENDIENTE, ESTADOS_TRANSFERENCIA } from "@/lib/pagos";
import type { estadoCuenta } from "@/lib/cobro-servicio";
import { formatoFolioCertificado, type DatosCertificado } from "@/lib/certificados";

type Estado = NonNullable<Awaited<ReturnType<typeof estadoCuenta>>>;

export function pdfEstadoCuenta(
  e: Estado,
  info: { comunidad: string; direccion: string; unidad: string; moneda: string; emitidoPor: string },
  ahora = new Date(),
) {
  const $ = (n: number | { toString(): string }) => formatoMoneda(n, info.moneda);
  const n = (v: { toString(): string }) => Number(v.toString());
  return generarPdf(`Estado de cuenta - Unidad ${info.unidad}`, (doc) => {
    encabezado(doc, {
      arriba: `${MARCA.nombre} · ${info.comunidad}${info.direccion ? `, ${info.direccion}` : ""}`,
      titulo: `Estado de cuenta · Unidad ${info.unidad}`,
      abajo: `Emitido el ${formatoFechaHora(ahora)} por ${info.emitidoPor}. Refleja los registros de la administración a esa hora.`,
    });
    cifras(doc, [
      { etiqueta: "Deuda confirmada", valor: $(e.deuda) },
      { etiqueta: "De eso, vencido", valor: $(e.vencida) },
      { etiqueta: "Por verificar", valor: $(e.enVerificacion.monto) },
      { etiqueta: "Saldo a favor", valor: $(e.aFavor) },
    ]);

    // Obligaciones con saldo, de la más antigua a la más reciente.
    const conSaldo = e.avisos.filter((a) => n(a.saldo) > 0).sort((a, b) => a.vencimiento.getTime() - b.vencimiento.getTime());
    subtitulo(doc, "Obligaciones por pagar");
    if (conSaldo.length === 0) {
      doc.font("Helvetica").fontSize(10).fillColor(COLOR.texto).text("No hay obligaciones con saldo pendiente.", { width: ANCHO });
      doc.moveDown(1);
    } else {
      const ultimo = conSaldo.at(-1)!;
      const anteriores = conSaldo.slice(0, -1).reduce((s, a) => s + n(a.saldo), 0);
      tabla(
        doc,
        [
          { titulo: "Período", ancho: ANCHO * 0.24 },
          { titulo: "Vence", ancho: ANCHO * 0.15 },
          { titulo: "Estado", ancho: ANCHO * 0.15 },
          { titulo: "Total", ancho: ANCHO * 0.15, alinear: "right" },
          { titulo: "Pagado", ancho: ANCHO * 0.15, alinear: "right" },
          { titulo: "Saldo", ancho: ANCHO * 0.16, alinear: "right" },
        ],
        [
          ...conSaldo.map((a) => ({
            celdas: [
              nombrePeriodo(a.periodo.anio, a.periodo.mes),
              formatoFecha(a.vencimiento),
              a.vencimiento < ahora ? "Vencido" : "Por vencer",
              $(a.total),
              $(n(a.total) - n(a.saldo)),
              $(a.saldo),
            ],
          })),
          { celdas: ["Total adeudado", "", "", "", "", $(e.deuda)], fuerte: true },
        ],
      );
      if (conSaldo.length > 1) {
        doc.font("Helvetica").fontSize(9).fillColor(COLOR.suave)
          .text(`Saldo de períodos anteriores a ${nombrePeriodo(ultimo.periodo.anio, ultimo.periodo.mes)}: ${$(anteriores)}.`, MARGEN, doc.y, { width: ANCHO });
        doc.moveDown(1);
      }
    }

    // Pagos informados sin verificar: aparte, no descuentan.
    if (e.enVerificacion.cantidad > 0) {
      subtitulo(doc, "Transferencias informadas pendientes de verificación (no descuentan deuda)");
      tabla(
        doc,
        [
          { titulo: "Transferida el", ancho: ANCHO * 0.22 },
          { titulo: "Informada el", ancho: ANCHO * 0.22 },
          { titulo: "Estado", ancho: ANCHO * 0.36 },
          { titulo: "Monto", ancho: ANCHO * 0.2, alinear: "right" },
        ],
        e.enVerificacion.lista.map((t) => ({
          celdas: [formatoFecha(t.fecha), formatoFecha(t.creadoEn), ESTADOS_TRANSFERENCIA[t.estado].texto, $(t.monto)],
        })),
      );
      doc.font("Helvetica").fontSize(9).fillColor(COLOR.suave).text(MENSAJE_PAGO_PENDIENTE, MARGEN, doc.y, { width: ANCHO });
      doc.moveDown(1);
    }

    // Pagos confirmados (los 12 más recientes).
    const vigentes = e.pagos.filter((p) => !p.anuladoEn).slice(0, 12);
    subtitulo(doc, "Pagos confirmados (últimos 12)");
    if (vigentes.length === 0) {
      doc.font("Helvetica").fontSize(10).fillColor(COLOR.texto).text("No hay pagos registrados.", { width: ANCHO });
      doc.moveDown(1);
    } else {
      tabla(
        doc,
        [
          { titulo: "Fecha", ancho: ANCHO * 0.15 },
          { titulo: "Medio", ancho: ANCHO * 0.17 },
          { titulo: "Aplicado a", ancho: ANCHO * 0.36 },
          { titulo: "Banco", ancho: ANCHO * 0.14 },
          { titulo: "Monto", ancho: ANCHO * 0.18, alinear: "right" },
        ],
        vigentes.map((p) => ({
          celdas: [
            formatoFecha(p.fecha),
            ETIQUETAS_MEDIO_PAGO[p.medio],
            p.aplicaciones.length ? p.aplicaciones.map((a) => nombrePeriodo(a.aviso.periodo.anio, a.aviso.periodo.mes)).join(", ") : "Saldo a favor",
            p.conciliaciones.length ? "Conciliado" : "Sin cartola",
            $(p.monto),
          ],
        })),
      );
    }

    // Historial breve: últimos 6 avisos emitidos y lo pagado de cada uno.
    const recientes = [...e.avisos].sort((a, b) => b.vencimiento.getTime() - a.vencimiento.getTime()).slice(0, 6);
    if (recientes.length) {
      subtitulo(doc, "Historial breve (últimos avisos emitidos)");
      tabla(
        doc,
        [
          { titulo: "Período", ancho: ANCHO * 0.3 },
          { titulo: "Monto emitido", ancho: ANCHO * 0.25, alinear: "right" },
          { titulo: "Pagado", ancho: ANCHO * 0.225, alinear: "right" },
          { titulo: "Saldo", ancho: ANCHO * 0.225, alinear: "right" },
        ],
        recientes.map((a) => ({ celdas: [nombrePeriodo(a.periodo.anio, a.periodo.mes), $(a.total), $(n(a.total) - n(a.saldo)), $(a.saldo)] })),
      );
    }
    doc.font("Helvetica").fontSize(8).fillColor(COLOR.suave).text(
      "Este estado de cuenta es informativo. No es un certificado de deuda ni de unidad al día. Los pagos informados se descuentan solo cuando la administración los verifica con la cartola del banco.",
      MARGEN,
      doc.y,
      { width: ANCHO },
    );
  });
}

export function pdfCertificadoAlDia(d: DatosCertificado, enlaceVerificacion: string) {
  const $ = (n: number) => formatoMoneda(n, d.moneda);
  const emitido = new Date(d.emitidoEn);
  return generarPdf(`Certificado ${formatoFolioCertificado(d.folio)}`, (doc) => {
    const lado = 92;
    const y0 = doc.y;
    dibujarQr(doc, enlaceVerificacion, MARGEN + ANCHO - lado, y0, lado);
    doc.font("Helvetica").fontSize(9).fillColor(COLOR.suave).text(`${MARCA.nombre} · ${d.comunidad}`, MARGEN, y0, { width: ANCHO - lado - 16 });
    doc.moveDown(0.3);
    doc.font("Helvetica-Bold").fontSize(18).fillColor(COLOR.texto).text("Certificado de unidad al día", { width: ANCHO - lado - 16 });
    doc.font("Helvetica").fontSize(10).fillColor(COLOR.suave).text(`Folio ${formatoFolioCertificado(d.folio)}`, { width: ANCHO - lado - 16 });
    doc.y = Math.max(doc.y, y0 + lado) + 20;

    doc.font("Helvetica").fontSize(11).fillColor(COLOR.texto).text(
      `La administración de ${d.comunidad}${d.direccion ? ` (${d.direccion})` : ""} certifica que la unidad ${d.unidad}, ` +
        `al ${formatoFechaHora(emitido)}, NO registra obligaciones de gastos comunes vencidas e impagas.`,
      MARGEN,
      doc.y,
      { width: ANCHO, lineGap: 3 },
    );
    doc.moveDown(1);
    const filas: [string, string][] = [
      ["Último período emitido", d.ultimoPeriodo ?? "—"],
      ["Obligaciones aún no vencidas", d.porVencer > 0 ? `${$(d.porVencer)}${d.proximoVencimiento ? ` (vence el ${formatoFecha(new Date(`${d.proximoVencimiento}T00:00:00Z`))})` : ""}` : "No tiene"],
      ["Saldo a favor confirmado", $(d.aFavor)],
      ["Emitido por", d.emitidoPor],
    ];
    tabla(
      doc,
      [
        { titulo: "Dato", ancho: ANCHO * 0.42 },
        { titulo: "Valor", ancho: ANCHO * 0.58 },
      ],
      filas.map(([a, b]) => ({ celdas: [a, b] })),
    );
    doc.font("Helvetica").fontSize(9).fillColor(COLOR.suave).text(
      "Estar al día significa no tener obligaciones vencidas impagas a la fecha de emisión; no equivale necesariamente a tener saldo cero. " +
        "Los pagos informados que aún están pendientes de verificación no se consideran pagados. " +
        "Este certificado es válido para la fecha y hora indicadas; obligaciones posteriores no quedan cubiertas.",
      { width: ANCHO, lineGap: 2 },
    );
    doc.moveDown(0.6);
    doc.text(`Verifica su autenticidad escaneando el código QR o en: ${enlaceVerificacion}`, { width: ANCHO });
  });
}
