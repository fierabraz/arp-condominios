"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdministradora } from "@/lib/auth";
import { aMonto, aNumero, aTexto, erroresDe, type EstadoForm } from "@/lib/forms";
import { anularPago, emitirPeriodo, ErrorCobro, registrarPago } from "@/lib/cobro-servicio";
import { enviarAvisosPeriodo } from "@/lib/envio-avisos";
import { MedioPago, TipoGasto } from "@/generated/prisma/enums";
import { nombrePeriodo } from "@/lib/cobro";
import { formatoMoneda } from "@/lib/formato";
import { registrar } from "@/lib/registro";

const PeriodoSchema = z.object({
  anio: z.number({ error: "Ingresa el año." }).int().min(2000, { error: "Año no válido." }).max(2100, { error: "Año no válido." }),
  mes: z.number({ error: "Elige el mes." }).int().min(1).max(12),
});

export async function abrirPeriodo(condominioId: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const { usuario, administradoraId } = await requireAdministradora();
  const datos = PeriodoSchema.safeParse({ anio: aNumero(formData.get("anio")), mes: aNumero(formData.get("mes")) });
  if (!datos.success) return erroresDe(datos.error);

  const condominio = await db.condominio.findFirst({ where: { id: condominioId, administradoraId } });
  if (!condominio) return { mensaje: "Condominio no encontrado." };
  const existe = await db.periodo.findUnique({
    where: { condominioId_anio_mes: { condominioId, ...datos.data } },
  });
  if (existe) return { mensaje: "Ese período ya existe." };

  const periodo = await db.periodo.create({ data: { ...datos.data, condominioId, administradoraId } });
  await registrar(usuario, "Abrió un mes", `${nombrePeriodo(periodo.anio, periodo.mes)} en ${condominio.nombre}`, condominioId);
  redirect(`/condominios/${condominioId}/periodos/${periodo.id}`);
}

const GastoSchema = z
  .object({
    tipo: z.enum(TipoGasto),
    unidadId: z.string().optional(),
    categoria: z.string({ error: "Elige una categoría." }).min(1, { error: "Elige una categoría." }),
    descripcion: z.string({ error: "Describe el gasto." }).min(2, { error: "Describe el gasto." }),
    proveedor: z.string().optional(),
    documento: z.string().optional(),
    monto: z.number({ error: "Ingresa el monto." }).gt(0, { error: "Debe ser mayor que 0." }),
    fecha: z.coerce.date({ error: "Ingresa la fecha." }),
  })
  .refine((g) => g.tipo !== "INDIVIDUAL" || g.unidadId, {
    error: "Elige la unidad a la que se carga.",
    path: ["unidadId"],
  });

export async function agregarGasto(periodoId: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const { usuario, administradoraId } = await requireAdministradora();
  const datos = GastoSchema.safeParse({
    tipo: formData.get("tipo"),
    unidadId: aTexto(formData.get("unidadId")),
    categoria: aTexto(formData.get("categoria")),
    descripcion: aTexto(formData.get("descripcion")),
    proveedor: aTexto(formData.get("proveedor")),
    documento: aTexto(formData.get("documento")),
    monto: aMonto(formData.get("monto")),
    fecha: aTexto(formData.get("fecha")),
  });
  if (!datos.success) return erroresDe(datos.error);

  const periodo = await db.periodo.findFirst({ where: { id: periodoId, administradoraId } });
  if (!periodo) return { mensaje: "Período no encontrado." };
  if (periodo.estado === "CERRADO") return { mensaje: "El período está cerrado." };
  const { unidadId, ...resto } = datos.data;
  if (resto.tipo === "INDIVIDUAL") {
    const unidad = await db.unidad.findFirst({ where: { id: unidadId, condominioId: periodo.condominioId } });
    if (!unidad) return { errores: { unidadId: ["Unidad no encontrada."] } };
  }

  await db.gasto.create({
    data: { ...resto, unidadId: resto.tipo === "INDIVIDUAL" ? unidadId : null, periodoId, administradoraId },
  });
  await registrar(
    usuario,
    "Agregó un gasto",
    `${resto.descripcion} (${resto.categoria}) por ${formatoMoneda(resto.monto, usuario.administradora?.moneda)} en ${nombrePeriodo(periodo.anio, periodo.mes)}`,
    periodo.condominioId,
  );
  revalidatePath(`/condominios/${periodo.condominioId}/periodos/${periodoId}`);
  return { ok: true, mensaje: "Gasto registrado." };
}

export async function eliminarGasto(gastoId: string) {
  const { usuario, administradoraId } = await requireAdministradora();
  const gasto = await db.gasto.findFirst({
    where: { id: gastoId, administradoraId },
    include: { periodo: true },
  });
  if (!gasto || gasto.periodo.estado === "CERRADO") return;
  await db.gasto.delete({ where: { id: gastoId } });
  await registrar(
    usuario,
    "Quitó un gasto",
    `${gasto.descripcion} por ${formatoMoneda(gasto.monto, usuario.administradora?.moneda)} en ${nombrePeriodo(gasto.periodo.anio, gasto.periodo.mes)}`,
    gasto.periodo.condominioId,
  );
  revalidatePath(`/condominios/${gasto.periodo.condominioId}/periodos/${gasto.periodoId}`);
}

export async function cerrarPeriodo(periodoId: string): Promise<EstadoForm> {
  const { usuario, administradoraId } = await requireAdministradora();
  try {
    const n = await emitirPeriodo(periodoId, administradoraId);
    const periodo = await db.periodo.findUniqueOrThrow({ where: { id: periodoId } });
    await registrar(usuario, "Cerró un mes y emitió cobros", `${nombrePeriodo(periodo.anio, periodo.mes)}: ${n} avisos de cobro`, periodo.condominioId);
    revalidatePath(`/condominios/${periodo.condominioId}`, "layout");
    return { ok: true, mensaje: `Período cerrado: ${n} avisos de cobro emitidos.` };
  } catch (e) {
    if (e instanceof ErrorCobro) return { mensaje: e.message };
    throw e;
  }
}

const PagoSchema = z.object({
  unidadId: z.string({ error: "Elige la unidad." }).min(1, { error: "Elige la unidad." }),
  monto: z.number({ error: "Ingresa el monto." }).gt(0, { error: "Debe ser mayor que 0." }),
  fecha: z.coerce.date({ error: "Ingresa la fecha." }),
  medio: z.enum(MedioPago),
  referencia: z.string().optional(),
});

export async function nuevoPago(condominioId: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const { usuario, administradoraId } = await requireAdministradora();
  const datos = PagoSchema.safeParse({
    unidadId: aTexto(formData.get("unidadId")),
    monto: aMonto(formData.get("monto")),
    fecha: aTexto(formData.get("fecha")),
    medio: formData.get("medio"),
    referencia: aTexto(formData.get("referencia")),
  });
  if (!datos.success) return erroresDe(datos.error);
  const unidad = await db.unidad.findFirst({ where: { id: datos.data.unidadId, condominioId, administradoraId } });
  if (!unidad) return { errores: { unidadId: ["Unidad no encontrada."] } };

  try {
    await registrarPago(administradoraId, datos.data);
    await registrar(
      usuario,
      "Registró un pago",
      `Unidad ${unidad.numero}: ${formatoMoneda(datos.data.monto, usuario.administradora?.moneda)}${datos.data.referencia ? ` (ref. ${datos.data.referencia})` : ""}`,
      condominioId,
    );
  } catch (e) {
    if (e instanceof ErrorCobro) return { mensaje: e.message };
    throw e;
  }
  revalidatePath(`/condominios/${condominioId}`, "layout");
  return { ok: true, mensaje: `Pago de la unidad ${unidad.numero} registrado.` };
}

export async function eliminarPago(pagoId: string) {
  const { usuario, administradoraId } = await requireAdministradora();
  const pago = await anularPago(pagoId, administradoraId).catch((e) => {
    if (e instanceof ErrorCobro) return null;
    throw e;
  });
  if (!pago) return;
  const unidad = await db.unidad.findUniqueOrThrow({ where: { id: pago.unidadId } });
  await registrar(
    usuario,
    "Anuló un pago",
    `Unidad ${unidad.numero}: ${formatoMoneda(pago.monto, usuario.administradora?.moneda)}`,
    unidad.condominioId,
  );
  revalidatePath(`/condominios/${unidad.condominioId}`, "layout");
}

export async function enviarAvisos(periodoId: string): Promise<EstadoForm> {
  const { usuario, administradoraId } = await requireAdministradora();
  const periodo = await db.periodo.findFirst({ where: { id: periodoId, administradoraId } });
  if (!periodo) return { mensaje: "Período no encontrado." };
  if (periodo.estado !== "CERRADO") return { mensaje: "Primero cierra el período para emitir los avisos." };

  const r = await enviarAvisosPeriodo(periodoId, administradoraId);
  await registrar(
    usuario,
    "Envió avisos de cobro",
    `${nombrePeriodo(periodo.anio, periodo.mes)}: ${r.enviados} enviados, ${r.simulados} en modo de prueba, ${r.errores} con error`,
    periodo.condominioId,
  );
  revalidatePath(`/condominios/${periodo.condominioId}/periodos/${periodoId}`);
  const partes = [];
  if (r.enviados) partes.push(`${r.enviados} correos enviados`);
  if (r.simulados) partes.push(`${r.simulados} correos guardados en modo de prueba`);
  if (r.errores) partes.push(`${r.errores} con error`);
  if (r.sinCorreo.length) partes.push(`sin correo registrado: unidades ${r.sinCorreo.join(", ")}`);
  return { ok: r.errores === 0, mensaje: partes.length ? `${partes.join("; ")}.` : "No hay avisos para enviar." };
}
