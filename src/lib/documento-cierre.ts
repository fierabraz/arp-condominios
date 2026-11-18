import "server-only";
// FIN-COMP · Entrega C · Informe de cierre del mes en PDF. Se dibuja con el resumen que quedó
// guardado al cerrar (no se recalcula): así el informe no cambia aunque después lleguen pagos.

import { ANCHO, cifras, COLOR, encabezado, generarPdf, subtitulo, tabla } from "@/lib/pdf";
import { MARCA } from "@/lib/marca";
import { formatoFechaHora, formatoMoneda } from "@/lib/formato";
import type { ResumenCierre } from "@/lib/cierre-servicio";

export function pdfInformeCierre(r: ResumenCierre, moneda: string, reapertura?: { en: Date; por: string | null; motivo: string | null } | null) {
  const $ = (x: number) => formatoMoneda(x, moneda);
  return generarPdf(`Informe de cierre - ${r.periodo}`, (doc) => {
    encabezado(doc, {
      arriba: `${MARCA.nombre} · ${r.comunidad}`,
      titulo: `Informe de cierre · ${r.periodo}`,
      abajo: `Mes cerrado el ${formatoFechaHora(new Date(r.cerradoEn))} por ${r.cerradoPor}. Las cifras son las del momento del cierre.`,
    });
    cifras(doc, [
      { etiqueta: "Emitido", valor: $(r.emitido) },
      { etiqueta: "Pendiente del mes", valor: $(r.pendienteDelMes) },
      { etiqueta: "Ingresos del mes", valor: $(r.ingresosDelMes) },
      { etiqueta: "Morosidad vencida", valor: $(r.morosidadVencida) },
    ]);

    subtitulo(doc, "Ingresos y egresos del mes");
    tabla(
      doc,
      [
        { titulo: "Concepto", ancho: ANCHO * 0.7 },
        { titulo: "Monto", ancho: ANCHO * 0.3, alinear: "right" },
      ],
      [
        { celdas: [`Pagos de gastos comunes registrados (${r.pagosDelMes})`, $(r.ingresosDelMes)] },
        { celdas: ["Otros ingresos conciliados con la cartola", $(r.otrosIngresos)] },
        { celdas: ["Egresos pagados a proveedores", $(r.egresosPagadosDelMes)] },
        { celdas: ["Otros egresos conciliados con la cartola", $(r.otrosEgresos)] },
        { celdas: ["Gastos comunes prorrateados del mes", $(r.gastosComunes)] },
        { celdas: ["Gastos pagados con fondos (no prorrateados)", $(r.gastosConFondo)] },
        {
          celdas: [`Transferencias informadas pendientes de verificación (${r.transferenciasPendientes.cantidad})`, $(r.transferenciasPendientes.monto)],
        },
      ],
    );

    subtitulo(doc, "Bancos");
    if (r.bancos.length === 0) {
      doc.font("Helvetica").fontSize(10).fillColor(COLOR.texto).text("La comunidad no tiene cuentas bancarias registradas.", { width: ANCHO });
      doc.moveDown(1);
    } else {
      tabla(
        doc,
        [
          { titulo: "Cuenta", ancho: ANCHO * 0.28 },
          { titulo: "Movim.", ancho: ANCHO * 0.15, alinear: "right" },
          { titulo: "Abonos", ancho: ANCHO * 0.19, alinear: "right" },
          { titulo: "Cargos", ancho: ANCHO * 0.19, alinear: "right" },
          { titulo: "Saldo final", ancho: ANCHO * 0.19, alinear: "right" },
        ],
        r.bancos.map((b) => ({
          celdas: [b.cuenta, String(b.movimientos), $(b.abonos), $(b.cargos), b.saldoFinal === null ? "Sin dato" : $(b.saldoFinal)],
        })),
      );
    }

    subtitulo(doc, "Fondos al cierre");
    if (r.fondos.length === 0) {
      doc.font("Helvetica").fontSize(10).fillColor(COLOR.texto).text("La comunidad no tiene fondos registrados.", { width: ANCHO });
      doc.moveDown(1);
    } else {
      tabla(
        doc,
        [
          { titulo: "Fondo", ancho: ANCHO * 0.7 },
          { titulo: "Saldo", ancho: ANCHO * 0.3, alinear: "right" },
        ],
        r.fondos.map((f) => ({ celdas: [f.nombre, $(f.saldo)] })),
      );
    }

    subtitulo(doc, "Advertencias confirmadas al cerrar");
    doc.font("Helvetica").fontSize(10).fillColor(COLOR.texto);
    if (r.advertencias.length === 0) doc.text("Ninguna. El mes se cerró sin observaciones.", { width: ANCHO });
    else for (const a of r.advertencias) doc.text(`• ${a}`, { width: ANCHO });
    doc.moveDown(1);

    if (reapertura) {
      subtitulo(doc, "Reapertura anterior");
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor(COLOR.texto)
        .text(`Este mes se reabrió el ${formatoFechaHora(reapertura.en)}${reapertura.por ? ` por ${reapertura.por}` : ""}. Motivo: ${reapertura.motivo ?? "sin motivo"}. Luego se volvió a cerrar con las cifras de arriba.`, { width: ANCHO });
      doc.moveDown(1);
    }

    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(COLOR.suave)
      .text(
        "Un pago que llegue después del cierre se registra con su fecha real y se aplica a la deuda antigua, sin cambiar este informe. Las transferencias pendientes de verificación no cuentan como pagadas.",
        { width: ANCHO },
      );
  });
}
