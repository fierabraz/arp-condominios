"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermiso } from "@/lib/auth";
import { cancelarSolicitud, crearSolicitud } from "@/lib/cuentas";
import { ORDEN_RELACIONES } from "@/lib/cuentas-reglas";
import { aTexto, erroresDe, type EstadoForm } from "@/lib/forms";
import { anotarIntento, bloqueoVigente, ipCliente } from "@/lib/intentos";

const SolicitudSchema = z.object({
  codigo: z.string({ error: "Ingresa el código de tu comunidad." }).min(8, { error: "Ingresa el código de tu comunidad." }).max(20),
  unidad: z.string({ error: "Escribe tu unidad." }).min(1, { error: "Escribe tu unidad." }).max(60),
  relacion: z.enum(ORDEN_RELACIONES, { error: "Elige tu relación con la unidad." }),
  mensaje: z.string().max(500).optional(),
});

/** PILOTO-001: la persona pide vincularse con una unidad. No le da acceso hasta que la aprueben. */
export async function enviarSolicitud(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const usuario = await requirePermiso("portal.residente");
  const valores = Object.fromEntries(["codigo", "unidad", "relacion", "mensaje"].map((c) => [c, String(formData.get(c) ?? "")]));
  const clave = `solicitud:${usuario.id}`;
  const minutos = await bloqueoVigente(clave, await ipCliente());
  if (minutos > 0) return { mensaje: `Hubo demasiados códigos equivocados. Espera ${minutos} minutos.`, valores };
  const datos = SolicitudSchema.safeParse({
    codigo: aTexto(formData.get("codigo")),
    unidad: aTexto(formData.get("unidad")),
    relacion: aTexto(formData.get("relacion")),
    mensaje: aTexto(formData.get("mensaje")),
  });
  if (!datos.success) return { ...erroresDe(datos.error), valores };
  const r = await crearSolicitud(usuario, {
    codigo: datos.data.codigo,
    unidadTexto: datos.data.unidad,
    relacion: datos.data.relacion,
    mensaje: datos.data.mensaje ?? null,
  });
  if (!r.ok) {
    await anotarIntento(clave, null, false);
    return { mensaje: r.mensaje, valores };
  }
  revalidatePath("/mi-cuenta", "layout");
  return { ok: true, mensaje: `Solicitud enviada a ${r.comunidad}. Te avisaremos por correo cuando la revisen.` };
}

export async function cancelar(solicitudId: string) {
  const usuario = await requirePermiso("portal.residente");
  await cancelarSolicitud(usuario, solicitudId);
  revalidatePath("/mi-cuenta", "layout");
}
