"use server";

// FIN-COMP · Entrega C · Cierre de mes, reapertura y confirmación de prorrateos provisionales.

import { revalidatePath } from "next/cache";
import { requireAdministradora } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { db } from "@/lib/db";
import { registrarEn } from "@/lib/registro";
import { aTexto, type EstadoForm } from "@/lib/forms";
import { cerrarMes, ErrorCierre, reabrirMes } from "@/lib/cierre-servicio";

async function periodoDe(periodoId: string, permiso: "propiedad.administrar" | "propiedad.habilitarCobros") {
  const { usuario, administradoraId } = await requireAdministradora(permiso);
  const p = await db.periodo.findFirst({ where: { id: periodoId, administradoraId }, select: { condominioId: true } });
  if (!p || !puede(usuario, permiso, p.condominioId)) return null;
  return { usuario, condominioId: p.condominioId };
}

export async function cerrarMesAccion(periodoId: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const a = await periodoDe(periodoId, "propiedad.administrar");
  if (!a) return { mensaje: "Período no encontrado." };
  try {
    await cerrarMes(a.usuario, periodoId, formData.get("confirmo") === "1");
  } catch (e) {
    if (e instanceof ErrorCierre) return { mensaje: e.message };
    throw e;
  }
  revalidatePath(`/condominios/${a.condominioId}`, "layout");
  return { ok: true, mensaje: "Mes cerrado." };
}

/** Reabrir: solo el administrador principal (el mismo que habilita los cobros), con motivo. */
export async function reabrirMesAccion(periodoId: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const a = await periodoDe(periodoId, "propiedad.habilitarCobros");
  if (!a) return { mensaje: "Solo el administrador principal puede reabrir un mes." };
  try {
    await reabrirMes(a.usuario, periodoId, aTexto(formData.get("nota")) ?? "");
  } catch (e) {
    if (e instanceof ErrorCierre) return { mensaje: e.message };
    throw e;
  }
  revalidatePath(`/condominios/${a.condominioId}`, "layout");
  return { ok: true, mensaje: "Mes reabierto. Quedó en el registro de cambios." };
}

export async function confirmarProrrateosAccion(condominioId: string): Promise<EstadoForm> {
  const { usuario, administradoraId } = await requireAdministradora("propiedad.administrar");
  if (!puede(usuario, "propiedad.administrar", condominioId)) return { mensaje: "No tienes acceso a esta comunidad." };
  const c = await db.condominio.findFirst({ where: { id: condominioId, administradoraId }, include: { unidades: { select: { alicuota: true, prorrateoProvisional: true } } } });
  if (!c) return { mensaje: "Comunidad no encontrada." };
  const suma = c.unidades.reduce((s, u) => s + Number(u.alicuota), 0);
  if (Math.abs(suma - 100) > 0.0001) return { mensaje: `Los porcentajes suman ${suma.toLocaleString("es-CL")} %: deben sumar 100 % antes de confirmarlos.` };
  const n = c.unidades.filter((u) => u.prorrateoProvisional).length;
  await db.$transaction(async (tx) => {
    await tx.unidad.updateMany({ where: { condominioId, prorrateoProvisional: true }, data: { prorrateoProvisional: false } });
    await registrarEn(tx, {
      autor: usuario,
      accion: "Confirmó porcentajes de prorrateo provisionales",
      detalle: `${c.nombre}: ${n} unidad(es). Suman 100 %.`,
      condominioId,
      entidad: "Condominio",
      entidadId: condominioId,
      despues: { provisionales: 0, suma },
    });
  });
  revalidatePath(`/condominios/${condominioId}`, "layout");
  return { ok: true, mensaje: "Porcentajes confirmados." };
}
