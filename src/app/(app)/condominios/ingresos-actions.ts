"use server";

// FIN-COMP · Entrega A · Conciliar los abonos de la cartola con los ingresos. Solo pagos.verificar
// (administradores, no comité), en comunidades de su alcance. Todo queda en el registro de cambios
// y cada operación es una sola transacción (ver src/lib/conciliacion-servicio.ts).

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { puedeVerPropiedad, requireAdministradora } from "@/lib/auth";
import { aMonto, type EstadoForm } from "@/lib/forms";
import { formatoFecha, formatoMoneda } from "@/lib/formato";
import { ErrorCobro, PagoDuplicado } from "@/lib/cobro-servicio";
import { leerDistribucion } from "@/lib/conciliacion";
import { deshacerConciliacion, registrarIngresoDesdeMovimiento, registrarOtroIngreso, vincularPagoConMovimiento } from "@/lib/conciliacion-servicio";

export type EstadoIngreso = EstadoForm & { duplicado?: string };

async function acceso(condominioId: string, movimientoId: string) {
  const { usuario, administradoraId } = await requireAdministradora("pagos.verificar");
  if (!puedeVerPropiedad(usuario, condominioId)) return null;
  const m = await db.movimientoBancario.findFirst({ where: { id: movimientoId, condominioId, administradoraId }, select: { id: true } });
  return m ? { usuario, administradoraId } : null;
}

function refrescar(condominioId: string, movimientoId: string) {
  revalidatePath(`/condominios/${condominioId}/conciliacion/movimientos/${movimientoId}`);
  revalidatePath(`/condominios/${condominioId}`, "layout");
}

/** Registra un pago nuevo de una unidad respaldado por el abono. */
export async function registrarPagoDesdeMovimientoAccion(condominioId: string, movimientoId: string, _: EstadoIngreso, formData: FormData): Promise<EstadoIngreso> {
  const a = await acceso(condominioId, movimientoId);
  if (!a) return { mensaje: "Movimiento no encontrado." };
  const unidadId = String(formData.get("unidadId") ?? "");
  if (!unidadId) return { errores: { unidadId: ["Elige la unidad."] } };
  const monto = aMonto(formData.get("monto"));
  if (!monto || !Number.isFinite(monto) || monto <= 0) return { errores: { monto: ["Indica el monto."] } };
  const distribucion = leerDistribucion(formData.get("distribucion"));
  if (distribucion === "invalida") return { mensaje: "La distribución entre avisos no es válida. Recarga la página." };
  try {
    await registrarIngresoDesdeMovimiento(a.usuario, {
      condominioId,
      movimientoId,
      unidadId,
      monto,
      distribucion,
      permitirDuplicado: formData.get("permitirDuplicado") === "1",
    });
  } catch (e) {
    if (e instanceof PagoDuplicado) {
      const moneda = a.usuario.administradora?.moneda ?? "CLP";
      return {
        duplicado: `La unidad ya tiene un pago por ${formatoMoneda(monto, moneda)} del ${formatoFecha(e.existente.fecha)}${e.existente.referencia ? ` (${e.existente.referencia})` : ""}. Si es el mismo pago, usa «Vincular» en las sugerencias: así no se crea un segundo ingreso.`,
      };
    }
    if (e instanceof ErrorCobro) return { mensaje: e.message };
    throw e;
  }
  refrescar(condominioId, movimientoId);
  return { ok: true, mensaje: "Pago registrado y conciliado con el movimiento." };
}

/** Une un pago ya registrado a mano con el abono. No crea otro ingreso. */
export async function vincularPagoAccion(condominioId: string, movimientoId: string, pagoId: string): Promise<EstadoForm> {
  const a = await acceso(condominioId, movimientoId);
  if (!a) return { mensaje: "Movimiento no encontrado." };
  try {
    await vincularPagoConMovimiento(a.usuario, { condominioId, movimientoId, pagoId });
  } catch (e) {
    if (e instanceof ErrorCobro) return { mensaje: e.message };
    throw e;
  }
  refrescar(condominioId, movimientoId);
  return { ok: true, mensaje: "Vinculado. El pago ya registrado quedó conciliado con este movimiento." };
}

const OtroSchema = z.object({
  concepto: z.string().trim().min(3, { error: "Indica el concepto (ej. arriendo de antena)." }).max(200),
  monto: z.number({ error: "Indica el monto." }).gt(0, { error: "Debe ser mayor que 0." }),
});

/** Ingreso de la comunidad que no es pago de una unidad. */
export async function otroIngresoAccion(condominioId: string, movimientoId: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const a = await acceso(condominioId, movimientoId);
  if (!a) return { mensaje: "Movimiento no encontrado." };
  const datos = OtroSchema.safeParse({ concepto: formData.get("concepto") ?? "", monto: aMonto(formData.get("monto")) });
  if (!datos.success) return { mensaje: datos.error.issues[0]!.message };
  try {
    await registrarOtroIngreso(a.usuario, { condominioId, movimientoId, ...datos.data });
  } catch (e) {
    if (e instanceof ErrorCobro) return { mensaje: e.message };
    throw e;
  }
  refrescar(condominioId, movimientoId);
  return { ok: true, mensaje: "Ingreso registrado." };
}

const MotivoSchema = z.string().trim().min(5, { error: "Explica el motivo (al menos 5 letras)." }).max(300);

/** Deshace una conciliación hecha por error. El pago (si lo hay) no se anula. */
export async function deshacerConciliacionAccion(condominioId: string, movimientoId: string, conciliacionId: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const a = await acceso(condominioId, movimientoId);
  if (!a) return { mensaje: "Movimiento no encontrado." };
  const motivo = MotivoSchema.safeParse(formData.get("nota") ?? "");
  if (!motivo.success) return { errores: { nota: [motivo.error.issues[0]!.message] } };
  try {
    await deshacerConciliacion(a.usuario, { condominioId, conciliacionId, motivo: motivo.data });
  } catch (e) {
    if (e instanceof ErrorCobro) return { mensaje: e.message };
    throw e;
  }
  refrescar(condominioId, movimientoId);
  return { ok: true };
}
