"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermiso } from "@/lib/auth";
import { aprobarSolicitud, enlaceVerificacionDeSolicitud, rechazarSolicitud, renovarCodigoComunidad } from "@/lib/cuentas";
import { ORDEN_RELACIONES } from "@/lib/cuentas-reglas";
import { db } from "@/lib/db";
import { aTexto, type EstadoForm } from "@/lib/forms";
import { puede } from "@/lib/permisos";
import { registrar } from "@/lib/registro";

// PILOTO-001: la administración revisa quién pide vincularse con una unidad de su comunidad.
// Cada acción vuelve a comprobar, en el servidor, que la cuenta pueda revisar esa comunidad.

const AprobarSchema = z.object({
  unidadId: z.string({ error: "Elige la unidad." }).min(1, { error: "Elige la unidad." }),
  personaId: z.string({ error: "Elige la ficha de la persona." }).min(1, { error: "Elige la ficha de la persona." }),
  relacion: z.enum(ORDEN_RELACIONES, { error: "Elige la relación con la unidad." }),
});

export async function aprobar(condominioId: string, solicitudId: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const usuario = await requirePermiso("solicitudes.revisar");
  const d = AprobarSchema.safeParse({
    unidadId: aTexto(formData.get("unidadId")),
    personaId: aTexto(formData.get("personaId")),
    relacion: aTexto(formData.get("relacion")),
  });
  if (!d.success) return { mensaje: d.error.issues[0]?.message };
  const error = await aprobarSolicitud(usuario, solicitudId, d.data);
  if (error) return { mensaje: error };
  revalidatePath(`/condominios/${condominioId}/solicitudes`);
  return { ok: true, mensaje: "Solicitud aprobada. La persona ya puede ver su unidad." };
}

export async function rechazar(condominioId: string, solicitudId: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const usuario = await requirePermiso("solicitudes.revisar");
  const motivo = aTexto(formData.get("motivo"));
  if (!motivo || motivo.length < 5) return { mensaje: "Escribe el motivo: la persona lo verá." };
  const error = await rechazarSolicitud(usuario, solicitudId, motivo.slice(0, 300));
  if (error) return { mensaje: error };
  revalidatePath(`/condominios/${condominioId}/solicitudes`);
  return { ok: true, mensaje: "Solicitud rechazada." };
}

/** Enlace para confirmar el correo de un solicitante, para mandárselo si el correo no llega. */
export async function enlaceConfirmacion(solicitudId: string) {
  const usuario = await requirePermiso("solicitudes.revisar");
  return enlaceVerificacionDeSolicitud(usuario, solicitudId);
}

export async function cambiarCodigoComunidad(condominioId: string) {
  const usuario = await requirePermiso("solicitudes.revisar");
  if (!usuario.administradoraId || !puede(usuario, "solicitudes.revisar", condominioId)) return;
  const c = await db.condominio.findFirst({ where: { id: condominioId, administradoraId: usuario.administradoraId }, select: { id: true } });
  if (!c) return;
  await renovarCodigoComunidad(c.id);
  await registrar(usuario, "Generó un código nuevo para que los residentes pidan unirse", "El código anterior dejó de servir", c.id);
  revalidatePath(`/condominios/${condominioId}/solicitudes`);
}
