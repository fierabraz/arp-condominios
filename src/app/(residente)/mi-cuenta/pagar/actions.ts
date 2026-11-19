"use server";

// PAG-001 · El residente informa una transferencia. NO es un pago: queda pendiente de verificación.

import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermiso } from "@/lib/auth";
import { aFechaDia, aMonto, aTexto, erroresDe, type EstadoForm } from "@/lib/forms";
import { hoyChile } from "@/lib/formato";
import { ErrorTransferencia, informarTransferencia, revisarComprobante, TransferenciaRepetida } from "@/lib/transferencias-servicio";

export type EstadoInforme = EstadoForm & { repetida?: string[] };

const InformeSchema = z.object({
  unidadId: z.string().min(1).max(40),
  avisoId: z.string().max(40).optional(),
  fecha: z.date({ error: "Indica la fecha de la transferencia." }).refine((d) => !Number.isNaN(d.getTime()), { error: "Indica la fecha de la transferencia." }),
  monto: z
    .number({ error: "Indica el monto transferido." })
    .refine((n) => Number.isFinite(n) && n > 0, { error: "El monto debe ser mayor que cero." })
    .refine((n) => n < 1e10, { error: "Revisa el monto." }),
  bancoOrigen: z.string().max(60).optional(),
  operacion: z.string().max(40, { error: "El número de operación es muy largo." }).optional(),
  pagadoPor: z.string().max(80).optional(),
  observaciones: z.string().max(500, { error: "Las observaciones no pueden pasar de 500 caracteres." }).optional(),
});

export async function informarTransferenciaAccion(formData: FormData): Promise<EstadoInforme> {
  const usuario = await requirePermiso("portal.residente");
  const datos = InformeSchema.safeParse({
    unidadId: String(formData.get("unidadId") ?? ""),
    avisoId: aTexto(formData.get("avisoId")),
    fecha: aFechaDia(formData.get("fecha")) ?? undefined,
    monto: aMonto(formData.get("monto")),
    bancoOrigen: aTexto(formData.get("bancoOrigen")),
    operacion: aTexto(formData.get("operacion")),
    pagadoPor: aTexto(formData.get("pagadoPor")),
    observaciones: aTexto(formData.get("observaciones")),
  });
  if (!datos.success) return erroresDe(datos.error);
  const hoy = new Date(`${hoyChile()}T00:00:00Z`);
  if (datos.data.fecha > hoy) return { errores: { fecha: ["La fecha no puede ser futura."] } };
  if (datos.data.fecha.getTime() < hoy.getTime() - 400 * 86_400_000) return { errores: { fecha: ["Esa fecha es de hace más de un año. Consulta a la administración."] } };

  const archivo = formData.get("comprobante");
  const file = archivo instanceof File && archivo.size > 0 ? archivo : null;
  const comprobante = revisarComprobante(file, file ? Buffer.from(await file.arrayBuffer()) : null);
  if (!comprobante.ok) return { errores: { comprobante: [comprobante.mensaje] } };

  let informadaId: string;
  try {
    ({ id: informadaId } = await informarTransferencia(usuario, datos.data, comprobante.valor, formData.get("confirmar") === "1"));
  } catch (e) {
    if (e instanceof TransferenciaRepetida) return { repetida: e.motivos };
    if (e instanceof ErrorTransferencia) return { mensaje: e.message };
    throw e;
  }
  redirect(`/mi-cuenta/pagar?unidad=${encodeURIComponent(datos.data.unidadId)}&informada=${encodeURIComponent(informadaId)}`);
}
