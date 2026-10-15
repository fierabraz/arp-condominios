import "server-only";
import { db } from "@/lib/db";
import { datosAviso } from "@/lib/reportes";
import { pdfAviso } from "@/lib/documentos";
import { enviarCorreo, escaparHtml } from "@/lib/correo";
import { formatoFecha, formatoMoneda } from "@/lib/formato";
import { nombrePeriodo } from "@/lib/cobro";

export type ResumenEnvio = { enviados: number; simulados: number; errores: number; sinCorreo: string[] };

/** Envía por correo el aviso de cobro de cada unidad del período a sus propietarios y residentes. */
export async function enviarAvisosPeriodo(periodoId: string, administradoraId: string): Promise<ResumenEnvio> {
  const avisos = await db.avisoCobro.findMany({
    where: { periodoId, administradoraId },
    select: {
      id: true,
      unidad: {
        select: { numero: true, personas: { select: { persona: { select: { nombre: true, correo: true } } } } },
      },
    },
  });
  const resumen: ResumenEnvio = { enviados: 0, simulados: 0, errores: 0, sinCorreo: [] };

  for (const aviso of avisos) {
    // Una persona puede ser propietaria y residente a la vez: un solo correo por dirección.
    const destinatarios = new Map<string, string>();
    for (const { persona } of aviso.unidad.personas) {
      if (persona.correo) destinatarios.set(persona.correo.toLowerCase(), persona.nombre);
    }
    if (destinatarios.size === 0) {
      resumen.sinCorreo.push(aviso.unidad.numero);
      continue;
    }

    const datos = (await datosAviso(aviso.id, administradoraId))!;
    const pdf = await pdfAviso(datos);
    const { aviso: a } = datos;
    const periodo = nombrePeriodo(a.periodo.anio, a.periodo.mes);
    const $ = (x: number) => formatoMoneda(x, a.administradora.moneda);
    const condominio = a.periodo.condominio.nombre;
    const nombreArchivo = `aviso-${a.periodo.anio}-${String(a.periodo.mes).padStart(2, "0")}-unidad-${a.unidad.numero}.pdf`;

    for (const [correo, nombre] of destinatarios) {
      const lineas = [
        `Hola ${nombre}:`,
        `Adjuntamos el aviso de cobro de ${periodo} de la unidad ${a.unidad.numero} de ${condominio}.`,
        `Total a pagar: ${$(datos.totalAPagar)}. Vence el ${formatoFecha(a.vencimiento)}.`,
        `Saludos,\n${a.administradora.nombre}`,
      ];
      const resultado = await enviarCorreo({
        para: correo,
        asunto: `Aviso de cobro ${periodo} · ${condominio} · Unidad ${a.unidad.numero}`,
        texto: lineas.join("\n\n"),
        html: lineas.map((l) => `<p>${escaparHtml(l).replace(/\n/g, "<br>")}</p>`).join(""),
        adjuntos: [{ nombre: nombreArchivo, contenido: pdf }],
      });
      await db.envioAviso.create({
        data: { avisoId: a.id, destinatario: correo, estado: resultado.estado, error: resultado.error },
      });
      if (resultado.estado === "ENVIADO") resumen.enviados++;
      else if (resultado.estado === "SIMULADO") resumen.simulados++;
      else resumen.errores++;
    }
  }
  return resumen;
}
