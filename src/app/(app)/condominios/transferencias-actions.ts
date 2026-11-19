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
  try {
    await confirmarTransferencia(a.usuario, { transferenciaId, movimientoId, monto, permitirDuplicado: formData.get("permitirDuplicado") === "1" });
  } catch (e) {
    if (e instanceof PagoDuplicado) {
      const moneda = a.usuario.administradora?.moneda ?? "CLP";
      return {
        duplicado: `La unidad ya tiene un pago por ${formatoMoneda(monto, moneda)} del ${formatoFecha(e.existente.fecha)}${e.existente.referencia ? ` (${e.existente.referencia})` : ""}. Si es el mismo pago registrado a mano, no confirmes: rechaza esta transferencia indicando que ya estaba registrado.`,
      };
    }
    if (e instanceof ErrorTransferencia || e instanceof ErrorCobro) return { mensaje: e.message };
    throw e;
  }
  refrescar(condominioId, transferenciaId);
  return { ok: true, mensaje: "Pago registrado y movimiento conciliado." };
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
