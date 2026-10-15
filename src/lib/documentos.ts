import "server-only";
import { ANCHO, cifras, COLOR, encabezado, generarPdf, MARGEN, subtitulo, tabla } from "@/lib/pdf";
import { formatoFecha, formatoMoneda, formatoPorcentaje } from "@/lib/formato";
import { nombrePeriodo } from "@/lib/cobro";
import type { datosAviso, datosRendicion } from "@/lib/reportes";

type DatosAviso = NonNullable<Awaited<ReturnType<typeof datosAviso>>>;
type DatosRendicion = NonNullable<Awaited<ReturnType<typeof datosRendicion>>>;

function pie(doc: PDFKit.PDFDocument, texto: string) {
  doc.moveDown(1);
  doc.font("Helvetica").fontSize(8).fillColor(COLOR.suave).text(texto, MARGEN, doc.y, { width: ANCHO });
}

export function pdfAviso(d: DatosAviso) {
  const { aviso } = d;
  const { condominio } = aviso.periodo;
  const $ = (x: number | { toString(): string }) => formatoMoneda(x, aviso.administradora.moneda);
  const periodo = nombrePeriodo(aviso.periodo.anio, aviso.periodo.mes);
  const nombres = (rel: string) =>
    [...new Set(aviso.unidad.personas.filter((p) => p.relacion === rel).map((p) => p.persona.nombre))].join(", ");

  return generarPdf(`Aviso de cobro ${periodo} - Unidad ${aviso.unidad.numero}`, (doc) => {
    encabezado(doc, {
      arriba: `${aviso.administradora.nombre} · ${condominio.nombre}, ${condominio.direccion}${condominio.comuna ? `, ${condominio.comuna}` : ""}`,
      titulo: `Aviso de cobro ${periodo}`,
      abajo: [
        `Unidad ${aviso.unidad.numero}`,
        nombres("PROPIETARIO") && `Propietario: ${nombres("PROPIETARIO")}`,
        nombres("RESIDENTE") && `Residente: ${nombres("RESIDENTE")}`,
      ]
        .filter(Boolean)
        .join("  ·  "),
    });

    cifras(doc, [
      { etiqueta: "Total a pagar", valor: $(d.totalAPagar) },
      { etiqueta: "Vence el", valor: formatoFecha(aviso.vencimiento) },
      { etiqueta: "Alícuota de la unidad", valor: formatoPorcentaje(aviso.unidad.alicuota) },
    ]);

    subtitulo(doc, "Detalle del cobro del mes");
    const filas: { celdas: string[]; fuerte?: boolean }[] = [
      { celdas: [`Gasto común (${formatoPorcentaje(aviso.unidad.alicuota)} de ${$(d.totalComun)})`, $(aviso.gastoComun)] },
      { celdas: [`Fondo de reserva (${condominio.porcentajeReserva.toString()} % del gasto común)`, $(aviso.fondoReserva)] },
      ...d.cargos.map((c) => ({ celdas: [`${c.categoria}: ${c.descripcion}`, $(c.monto)] })),
    ];
    if (Number(aviso.interes) > 0) {
      filas.push({ celdas: [`Interés por mora (${condominio.tasaInteresMora.toString()} % sobre deuda vencida)`, $(aviso.interes)] });
    }
    filas.push({ celdas: ["Total del mes", $(aviso.total)], fuerte: true });
    const pagado = Number(aviso.total) - Number(aviso.saldo);
    if (pagado > 0) filas.push({ celdas: ["Pagos ya aplicados a este aviso", `-${$(pagado)}`] });
    if (d.deudaAnterior > 0) filas.push({ celdas: ["Deuda de meses anteriores", $(d.deudaAnterior)] });
    filas.push({ celdas: ["Total a pagar", $(d.totalAPagar)], fuerte: true });
    tabla(doc, [{ titulo: "Concepto", ancho: ANCHO - 130 }, { titulo: "Monto", ancho: 130, alinear: "right" }], filas);

    if (d.aFavor > 0) {
      doc.font("Helvetica").fontSize(9.5).fillColor(COLOR.texto)
        .text(`La unidad tiene un saldo a favor de ${$(d.aFavor)} que se aplicará en el próximo cobro.`);
      doc.moveDown(1);
    }

    if (d.porCategoria.length > 0) {
      subtitulo(doc, `Gastos comunes del condominio en ${periodo}`);
      tabla(
        doc,
        [
          { titulo: "Categoría", ancho: ANCHO - 230 },
          { titulo: "% del total", ancho: 100, alinear: "right" },
          { titulo: "Monto", ancho: 130, alinear: "right" },
        ],
        [
          ...d.porCategoria.map((c) => ({ celdas: [c.categoria, formatoPorcentaje(c.porcentaje, 1), $(c.monto)] })),
          { celdas: ["Total gastos comunes", "100 %", $(d.totalComun)], fuerte: true },
        ],
      );
    }

    pie(doc, `Emitido el ${formatoFecha(aviso.emitidoEn)}. Los pagos se aplican primero a la deuda más antigua.`);
  });
}

export function pdfRendicion(d: DatosRendicion) {
  const { periodo } = d;
  const $ = (x: number | { toString(): string }) => formatoMoneda(x, periodo.administradora.moneda);
  const nombre = nombrePeriodo(periodo.anio, periodo.mes);

  return generarPdf(`Rendición ${nombre} - ${periodo.condominio.nombre}`, (doc) => {
    encabezado(doc, {
      arriba: periodo.administradora.nombre,
      titulo: `Rendición de gastos ${nombre}`,
      abajo: `${periodo.condominio.nombre} · ${periodo.condominio.direccion}${periodo.condominio.comuna ? `, ${periodo.condominio.comuna}` : ""}`,
    });

    cifras(doc, [
      { etiqueta: "Gastos comunes", valor: $(d.totalComun) },
      { etiqueta: "Cobrado a las unidades", valor: $(d.emitido) },
      { etiqueta: `Recaudado (${formatoPorcentaje(d.porcentajeRecaudado, 1)})`, valor: $(d.recaudado) },
      { etiqueta: "Pendiente", valor: $(d.pendiente) },
    ]);

    subtitulo(doc, "Gastos comunes por categoría");
    tabla(
      doc,
      [
        { titulo: "Categoría", ancho: ANCHO - 230 },
        { titulo: "% del total", ancho: 100, alinear: "right" },
        { titulo: "Monto", ancho: 130, alinear: "right" },
      ],
      [
        ...d.porCategoria.map((c) => ({ celdas: [c.categoria, formatoPorcentaje(c.porcentaje, 1), $(c.monto)] })),
        { celdas: ["Total", "100 %", $(d.totalComun)], fuerte: true },
      ],
    );

    subtitulo(doc, "Detalle de gastos");
    tabla(
      doc,
      [
        { titulo: "Fecha", ancho: 70 },
        { titulo: "Descripción", ancho: ANCHO - 70 - 130 - 120 },
        { titulo: "Proveedor", ancho: 130 },
        { titulo: "Monto", ancho: 120, alinear: "right" },
      ],
      [
        ...d.comunes.map((g) => ({
          celdas: [formatoFecha(g.fecha), `${g.descripcion}${g.documento ? ` (doc. ${g.documento})` : ""}`, g.proveedor ?? "", $(g.monto)],
        })),
        ...d.individuales.map((g) => ({
          celdas: [formatoFecha(g.fecha), `${g.descripcion} (unidad ${g.unidad?.numero})`, g.proveedor ?? "", $(g.monto)],
        })),
      ],
    );

    subtitulo(doc, "Fondo de reserva");
    tabla(doc, [{ titulo: "Concepto", ancho: ANCHO - 130 }, { titulo: "Monto", ancho: 130, alinear: "right" }], [
      { celdas: [`Aporte de este período (${periodo.condominio.porcentajeReserva.toString()} %)`, $(d.reservaPeriodo)] },
      { celdas: ["Total emitido al fondo hasta este período", $(d.reservaAcumulada)], fuerte: true },
    ]);

    subtitulo(doc, `Avisos impagos (${d.impagos.length} de ${d.unidades} unidades)`);
    if (d.impagos.length === 0) {
      doc.font("Helvetica").fontSize(9.5).fillColor(COLOR.texto).text("Todas las unidades pagaron este período.");
    } else {
      tabla(
        doc,
        [
          { titulo: "Unidad", ancho: ANCHO - 260 },
          { titulo: "Cobro del mes", ancho: 130, alinear: "right" },
          { titulo: "Saldo pendiente", ancho: 130, alinear: "right" },
        ],
        d.impagos.map((i) => ({ celdas: [i.numero, $(i.total), $(i.saldo)] })),
      );
    }

    pie(doc, `Generado el ${formatoFecha(new Date())}. Cifras de cobranza al momento de generar este documento.`);
  });
}
