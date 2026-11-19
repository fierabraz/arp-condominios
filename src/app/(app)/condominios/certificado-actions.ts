"use server";

// PILOTO-001 · Emitir el certificado de unidad al día. Solo administración (no comité) en
// comunidades de su alcance; la validación de deuda vencida se hace en la base, con la unidad bloqueada.

import { revalidatePath } from "next/cache";
import { puede } from "@/lib/permisos";
import { requireAdministradora } from "@/lib/auth";
import { db } from "@/lib/db";
import type { EstadoForm } from "@/lib/forms";
import { formatoFolioCertificado } from "@/lib/certificados";
import { emitirCertificadoAlDia, NoEstaAlDia } from "@/lib/certificados-servicio";

export async function emitirCertificadoAccion(condominioId: string, unidadId: string): Promise<EstadoForm> {
  const { usuario, administradoraId } = await requireAdministradora("certificados.emitir");
  if (!puede(usuario, "certificados.emitir", condominioId)) return { mensaje: "No tienes acceso a esta comunidad." };
  const u = await db.unidad.findFirst({ where: { id: unidadId, condominioId, administradoraId }, select: { id: true } });
  if (!u) return { mensaje: "Unidad no encontrada." };
  try {
    const c = await emitirCertificadoAlDia(usuario, unidadId);
    revalidatePath(`/condominios/${condominioId}/unidades/${unidadId}`);
    return { ok: true, mensaje: `Certificado ${formatoFolioCertificado(c.folio)} emitido. Descárgalo en la lista de certificados.` };
  } catch (e) {
    if (e instanceof NoEstaAlDia) return { mensaje: `No se puede emitir: ${e.message}` };
    throw e;
  }
}
