"use server";

// FIN-COMP · Entrega B · Egresos, conciliación de cargos y fondos. Solo administración (no comité),
// con el mismo permiso que concilia ingresos (pagos.verificar), en comunidades de su alcance.

import { revalidatePath } from "next/cache";
import { requireAdministradora } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { aMonto, aTexto, type EstadoForm } from "@/lib/forms";
import { MedioPago } from "@/generated/prisma/enums";
import {
  anularPagoEgreso,
  conciliarCargoConEgreso,
  crearFondo,
  ErrorEgreso,
  registrarMovimientoFondo,
  registrarOtroEgreso,
  registrarPagoEgreso,
  subirRespaldo,
} from "@/lib/egresos-servicio";

async function acceso(condominioId: string) {
  const { usuario } = await requireAdministradora("pagos.verificar");
  return puede(usuario, "pagos.verificar", condominioId) ? usuario : null;
}

async function intentar(condominioId: string, rutas: string[], ok: string, f: (usuario: NonNullable<Awaited<ReturnType<typeof acceso>>>) => Promise<unknown>): Promise<EstadoForm> {
  const usuario = await acceso(condominioId);
  if (!usuario) return { mensaje: "No tienes acceso a esta comunidad." };
  try {
    await f(usuario);
  } catch (e) {
    if (e instanceof ErrorEgreso) return { mensaje: e.message };
    throw e;
  }
  for (const r of rutas) revalidatePath(r);
  revalidatePath(`/condominios/${condominioId}`, "layout");
  return { ok: true, mensaje: ok };
}

const fechaDe = (v: FormDataEntryValue | null) => {
  const t = aTexto(v);
  const d = t ? new Date(`${t}T00:00:00Z`) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

export async function pagarEgresoAccion(condominioId: string, gastoId: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const fechaPago = fechaDe(formData.get("fechaPago"));
  const medio = aTexto(formData.get("medioPago")) as MedioPago | undefined;
  if (!fechaPago) return { errores: { fechaPago: ["Indica la fecha de pago."] } };
  if (!medio || !(medio in MedioPago)) return { errores: { medioPago: ["Elige el medio de pago."] } };
  return intentar(condominioId, [`/condominios/${condominioId}/egresos/${gastoId}`], "Pago registrado.", (u) =>
    registrarPagoEgreso(u, { condominioId, gastoId, fechaPago, medioPago: medio }),
  );
}

export async function anularPagoEgresoAccion(condominioId: string, gastoId: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const motivo = aTexto(formData.get("nota"));
  if (!motivo || motivo.length < 5) return { errores: { nota: ["Explica por qué (mínimo 5 letras)."] } };
  return intentar(condominioId, [`/condominios/${condominioId}/egresos/${gastoId}`], "El egreso volvió a «por pagar».", (u) =>
    anularPagoEgreso(u, { condominioId, gastoId, motivo }),
  );
}

export async function subirRespaldoAccion(condominioId: string, gastoId: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const archivo = formData.get("respaldo");
  if (!(archivo instanceof File) || archivo.size === 0) return { errores: { respaldo: ["Elige un archivo."] } };
  const datos = Buffer.from(await archivo.arrayBuffer());
  return intentar(condominioId, [`/condominios/${condominioId}/egresos/${gastoId}`], "Respaldo adjuntado.", (u) =>
    subirRespaldo(u, { condominioId, gastoId, nombre: archivo.name, archivo: datos }),
  );
}

export async function conciliarCargoAccion(condominioId: string, movimientoId: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const gastoId = aTexto(formData.get("gastoId"));
  if (!gastoId) return { errores: { gastoId: ["Elige el egreso."] } };
  return intentar(condominioId, [`/condominios/${condominioId}/conciliacion/movimientos/${movimientoId}`], "Cargo conciliado con el egreso.", (u) =>
    conciliarCargoConEgreso(u, { condominioId, movimientoId, gastoId }),
  );
}

export async function otroEgresoAccion(condominioId: string, movimientoId: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const monto = aMonto(formData.get("monto"));
  const concepto = aTexto(formData.get("concepto")) ?? "";
  if (!monto || monto <= 0) return { errores: { monto: ["Indica el monto."] } };
  return intentar(condominioId, [`/condominios/${condominioId}/conciliacion/movimientos/${movimientoId}`], "Otro egreso registrado.", (u) =>
    registrarOtroEgreso(u, { condominioId, movimientoId, monto, concepto }),
  );
}

export async function crearFondoAccion(condominioId: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const nombre = aTexto(formData.get("nombre")) ?? "";
  const saldoInicial = aMonto(formData.get("saldoInicial")) ?? 0;
  return intentar(condominioId, [`/condominios/${condominioId}/fondos`], "Fondo creado.", (u) => crearFondo(u, { condominioId, nombre, saldoInicial }));
}

export async function movimientoFondoAccion(condominioId: string, fondoId: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const tipo = formData.get("tipo") === "RETIRO" ? "RETIRO" : "APORTE";
  const fecha = fechaDe(formData.get("fecha"));
  const monto = aMonto(formData.get("monto"));
  const descripcion = aTexto(formData.get("descripcion")) ?? "";
  if (!fecha) return { errores: { fecha: ["Indica la fecha."] } };
  if (!monto || monto <= 0) return { errores: { monto: ["Indica el monto."] } };
  return intentar(condominioId, [`/condominios/${condominioId}/fondos`], tipo === "APORTE" ? "Aporte registrado." : "Retiro registrado.", (u) =>
    registrarMovimientoFondo(u, { condominioId, fondoId, tipo, fecha, monto, descripcion }),
  );
}
