"use server";

// PAG-001 · Verificar transferencias informadas por residentes. Solo pagos.verificar (administradores,
// no comité) y en comunidades de su alcance. Todo queda en el registro de cambios.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { puedeVerPropiedad, requireAdministradora } from "@/lib/auth";
import { aMonto, type EstadoForm } from "@/lib/forms";
import { formatoFecha, formatoMoneda } from "@/lib/formato";
import { ErrorCobro, PagoDuplicado } from "@/lib/cobro-servicio";
import { cambiarEstadoTransferencia, confirmarTransferencia, ErrorTransferencia } from "@/lib/transferencias-servicio";
import { leerDistribucion } from "@/lib/conciliacion";
import { reversarTransferencia, vincularTransferenciaConPago } from "@/lib/conciliacion-servicio";

export type EstadoConfirmar = EstadoForm & { duplicado?: string };

async function acceso(condominioId: string, transferenciaId: string) {
  const { usuario, administradoraId } = await requireAdministradora("pagos.verificar");
  if (!puedeVerPropiedad(usuario, condominioId)) return null;
  const t = await db.transferenciaInformada.findFirst({ where: { id: transferenciaId, condominioId, administradoraId }, select: { id: true } });
  return t ? { usuario, administradoraId } : null;
}

const refrescar = (condominioId: string, transferenciaId: string) => {
  revalidatePath(`/condominios/${condominioId}/transferencias`);
  revalidatePath(`/condominios/${condominioId}/transferencias/${transferenciaId}`);
};

export async function confirmarTransferenciaAccion(condominioId: string, transferenciaId: string, _: EstadoConfirmar, formData: FormData): Promise<EstadoConfirmar> {
  const a = await acceso(condominioId, transferenciaId);
  if (!a) return { mensaje: "Transferencia no encontrada." };
  const movimientoId = String(formData.get("movimientoId") ?? "");
  if (!movimientoId) return { mensaje: "Elige el movimiento de la cartola donde aparece la transferencia." };
  const monto = aMonto(formData.get("monto"));
  if (!monto || !Number.isFinite(monto) || monto <= 0) return { errores: { monto: ["Indica el monto a registrar como pago."] } };
  const distribucion = leerDistribucion(formData.get("distribucion"));
  if (distribucion === "invalida") return { mensaje: "La distribución entre avisos no es válida. Recarga la página." };
  try {
    await confirmarTransferencia(a.usuario, { transferenciaId, movimientoId, monto, distribucion, permitirDuplicado: formData.get("permitirDuplicado") === "1" });
  } catch (e) {
    if (e instanceof PagoDuplicado) {
      const moneda = a.usuario.administradora?.moneda ?? "CLP";
      return {
        duplicado: `La unidad ya tiene un pago por ${formatoMoneda(monto, moneda)} del ${formatoFecha(e.existente.fecha)}${e.existente.referencia ? ` (${e.existente.referencia})` : ""}. Si es el mismo pago registrado a mano, no confirmes: usa «Vincular con un pago ya registrado» (más abajo) y no se creará un segundo ingreso.`,
      };
    }
    if (e instanceof ErrorTransferencia || e instanceof ErrorCobro) return { mensaje: e.message };
    throw e;
  }
  refrescar(condominioId, transferenciaId);
  return { ok: true, mensaje: "Pago registrado y movimiento conciliado." };
}

/**
 * FIN-003.3: confirma con un clic la sugerencia de la verificación automática (transferencia «por
 * confirmar»): usa el abono sugerido y el monto informado, igual que confirmar a mano.
 */
export async function confirmarSugerenciaAccion(condominioId: string, transferenciaId: string): Promise<EstadoForm> {
  const a = await acceso(condominioId, transferenciaId);
  if (!a) return { mensaje: "Transferencia no encontrada." };
  const t = await db.transferenciaInformada.findFirst({
    where: { id: transferenciaId, condominioId, administradoraId: a.administradoraId },
    select: { estado: true, monto: true, autoResultado: true, autoMovimientoId: true },
  });
  if (!t || t.estado !== "EN_REVISION" || t.autoResultado !== "POR_CONFIRMAR" || !t.autoMovimientoId) {
    return { mensaje: "Esta transferencia ya no tiene un abono sugerido por confirmar. Recarga la página." };
  }
  try {
    await confirmarTransferencia(a.usuario, { transferenciaId, movimientoId: t.autoMovimientoId, monto: Number(t.monto) });
  } catch (e) {
    if (e instanceof PagoDuplicado) {
      return { mensaje: "La unidad ya tiene un pago igual registrado ese día. Abre la transferencia y, si es el mismo, usa «Vincular con este pago»." };
    }
    if (e instanceof ErrorTransferencia || e instanceof ErrorCobro) return { mensaje: e.message };
    throw e;
  }
  refrescar(condominioId, transferenciaId);
  revalidatePath(`/condominios/${condominioId}`, "layout");
  return { ok: true, mensaje: "Confirmada: pago registrado y abono conciliado." };
}

const NotaSchema = z.string().trim().min(5, { error: "Explica el motivo (al menos 5 letras): el residente lo verá." }).max(500);

export async function cambiarEstadoAccion(condominioId: string, transferenciaId: string, estado: "EN_REVISION" | "RECHAZADA", _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const a = await acceso(condominioId, transferenciaId);
  if (!a) return { mensaje: "Transferencia no encontrada." };
  const nota = NotaSchema.safeParse(formData.get("nota") ?? "");
  if (!nota.success) return { errores: { nota: [nota.error.issues[0]!.message] } };
  try {
    await cambiarEstadoTransferencia(a.usuario, { transferenciaId, estado, nota: nota.data });
  } catch (e) {
    if (e instanceof ErrorTransferencia) return { mensaje: e.message };
    throw e;
  }
  refrescar(condominioId, transferenciaId);
  return { ok: true };
}

/** FIN-COMP A: la transferencia corresponde a un pago que ya se registró a mano. No crea otro ingreso. */
export async function vincularTransferenciaAccion(condominioId: string, transferenciaId: string, pagoId: string): Promise<EstadoForm> {
  const a = await acceso(condominioId, transferenciaId);
  if (!a) return { mensaje: "Transferencia no encontrada." };
  try {
    const r = await vincularTransferenciaConPago(a.usuario, { condominioId, transferenciaId, pagoId });
    refrescar(condominioId, transferenciaId);
    revalidatePath(`/condominios/${condominioId}`, "layout");
    return {
      ok: true,
      mensaje: r.estado === "CONCILIADA" ? "Vinculada: el pago ya estaba conciliado con la cartola." : "Vinculada. Queda en revisión hasta encontrar el pago en la cartola.",
    };
  } catch (e) {
    if (e instanceof ErrorCobro) return { mensaje: e.message };
    throw e;
  }
}

const MotivoSchema = z.string().trim().min(5, { error: "Explica el motivo (al menos 5 letras)." }).max(300);

/** FIN-COMP A: reversa el pago de una transferencia verificada (auditado; el residente ve el motivo). */
export async function reversarTransferenciaAccion(condominioId: string, transferenciaId: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const a = await acceso(condominioId, transferenciaId);
  if (!a) return { mensaje: "Transferencia no encontrada." };
  const motivo = MotivoSchema.safeParse(formData.get("nota") ?? "");
  if (!motivo.success) return { errores: { nota: [motivo.error.issues[0]!.message] } };
  try {
    await reversarTransferencia(a.usuario, { condominioId, transferenciaId, motivo: motivo.data });
  } catch (e) {
    if (e instanceof ErrorCobro) return { mensaje: e.message };
    throw e;
  }
  refrescar(condominioId, transferenciaId);
  revalidatePath(`/condominios/${condominioId}`, "layout");
  return { ok: true };
}
