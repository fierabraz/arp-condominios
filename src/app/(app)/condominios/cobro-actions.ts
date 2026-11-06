"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { puedeVerPropiedad, requireAdministradora } from "@/lib/auth";
import { aMonto, aNumero, aTexto, erroresDe, type EstadoForm } from "@/lib/forms";
import { anularPago, emitirPeriodo, ErrorCobro, PagoDuplicado, registrarPago } from "@/lib/cobro-servicio";
import { enviarAvisosPeriodo } from "@/lib/envio-avisos";
import { MedioPago, TipoGasto } from "@/generated/prisma/enums";
import { nombrePeriodo } from "@/lib/cobro";
import { formatoFecha, formatoMoneda } from "@/lib/formato";
import { registrar, registrarEn } from "@/lib/registro";

const PeriodoSchema = z.object({
  anio: z.number({ error: "Ingresa el año." }).int().min(2000, { error: "Año no válido." }).max(2100, { error: "Año no válido." }),
  mes: z.number({ error: "Elige el mes." }).int().min(1).max(12),
});

export async function abrirPeriodo(condominioId: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const { usuario, administradoraId } = await requireAdministradora();
  const datos = PeriodoSchema.safeParse({ anio: aNumero(formData.get("anio")), mes: aNumero(formData.get("mes")) });
  if (!datos.success) return erroresDe(datos.error);

  const condominio = await db.condominio.findFirst({ where: { id: condominioId, administradoraId } });
  if (!condominio || !puedeVerPropiedad(usuario, condominioId)) return { mensaje: "Condominio no encontrado." };
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

/** Lo que se guarda de un gasto en el registro (SEG-25). */
function datosGasto(g: {
  tipo: string;
  categoria: string;
  descripcion: string;
  proveedor: string | null;
  documento: string | null;
  monto: { toString(): string };
  fecha: Date;
  unidadId: string | null;
  periodoId: string;
}) {
  return {
    tipo: g.tipo,
    categoria: g.categoria,
    descripcion: g.descripcion,
    proveedor: g.proveedor,
    documento: g.documento,
    monto: g.monto.toString(),
    fecha: g.fecha.toISOString(),
    unidadId: g.unidadId,
    periodoId: g.periodoId,
  };
}

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
  if (!periodo || !puedeVerPropiedad(usuario, periodo.condominioId)) return { mensaje: "Período no encontrado." };
  if (periodo.estado === "CERRADO") return { mensaje: "El período está cerrado." };
  const { unidadId, ...resto } = datos.data;
  if (resto.tipo === "INDIVIDUAL") {
    const unidad = await db.unidad.findFirst({ where: { id: unidadId, condominioId: periodo.condominioId } });
    if (!unidad) return { errores: { unidadId: ["Unidad no encontrada."] } };
  }

  // SEG-25: el gasto y su registro se guardan juntos; si el registro falla, el gasto no queda.
  await db.$transaction(async (tx) => {
    const gasto = await tx.gasto.create({
      data: { ...resto, unidadId: resto.tipo === "INDIVIDUAL" ? unidadId : null, periodoId, administradoraId },
    });
    await registrarEn(tx, {
      autor: usuario,
      accion: "Agregó un gasto",
      detalle: `${resto.descripcion} (${resto.categoria}) por ${formatoMoneda(resto.monto, usuario.administradora?.moneda)} en ${nombrePeriodo(periodo.anio, periodo.mes)}`,
      condominioId: periodo.condominioId,
      entidad: "Gasto",
      entidadId: gasto.id,
      despues: datosGasto(gasto),
    });
  });
  revalidatePath(`/condominios/${periodo.condominioId}/periodos/${periodoId}`);
  return { ok: true, mensaje: "Gasto registrado." };
}

export async function eliminarGasto(gastoId: string) {
  const { usuario, administradoraId } = await requireAdministradora();
  const gasto = await db.gasto.findFirst({
    where: { id: gastoId, administradoraId },
    include: { periodo: true },
  });
  if (!gasto || gasto.periodo.estado === "CERRADO" || !puedeVerPropiedad(usuario, gasto.periodo.condominioId)) return;
  await db.$transaction(async (tx) => {
    await tx.gasto.delete({ where: { id: gastoId } });
    await registrarEn(tx, {
      autor: usuario,
      accion: "Quitó un gasto",
      detalle: `${gasto.descripcion} por ${formatoMoneda(gasto.monto, usuario.administradora?.moneda)} en ${nombrePeriodo(gasto.periodo.anio, gasto.periodo.mes)}`,
      condominioId: gasto.periodo.condominioId,
      entidad: "Gasto",
      entidadId: gasto.id,
      antes: datosGasto(gasto),
    });
  });
  revalidatePath(`/condominios/${gasto.periodo.condominioId}/periodos/${gasto.periodoId}`);
}

export async function cerrarPeriodo(periodoId: string): Promise<EstadoForm> {
  const { usuario, administradoraId } = await requireAdministradora();
  const periodo = await db.periodo.findFirst({ where: { id: periodoId, administradoraId } });
  if (!periodo || !puedeVerPropiedad(usuario, periodo.condominioId)) return { mensaje: "Período no encontrado." };
  try {
    const n = await emitirPeriodo(periodoId, administradoraId, (avisos) => ({
      autor: usuario,
      accion: "Cerró un mes y emitió cobros",
      detalle: `${nombrePeriodo(periodo.anio, periodo.mes)}: ${avisos} avisos de cobro`,
      condominioId: periodo.condominioId,
      entidad: "Periodo",
      entidadId: periodoId,
      antes: { estado: periodo.estado },
      despues: { estado: "CERRADO", avisosEmitidos: avisos },
    }));
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
  if (!unidad || !puedeVerPropiedad(usuario, condominioId)) return { errores: { unidadId: ["Unidad no encontrada."] } };

  const confirmado = formData.get("confirmarDuplicado") === "si";
  const moneda = usuario.administradora?.moneda;
  try {
    await registrarPago(administradoraId, datos.data, {
      permitirDuplicado: confirmado,
      anotar: (pago) => ({
        autor: usuario,
        accion: "Registró un pago",
        detalle: `Unidad ${unidad.numero}: ${formatoMoneda(datos.data.monto, moneda)}${datos.data.referencia ? ` (ref. ${datos.data.referencia})` : ""}${confirmado ? ". Se confirmó aunque había otro pago igual ese día." : ""}`,
        condominioId,
        entidad: "Pago",
        entidadId: pago.id,
        despues: {
          unidad: unidad.numero,
          monto: String(datos.data.monto),
          fecha: datos.data.fecha.toISOString(),
          medio: datos.data.medio,
          referencia: datos.data.referencia ?? null,
          confirmadoComoDistinto: confirmado,
        },
      }),
    });
  } catch (e) {
    if (e instanceof PagoDuplicado) {
      // SEG-22: no se guarda; se pide confirmar y el formulario conserva lo escrito.
      const ref = e.existente.referencia ? `, ref. ${e.existente.referencia}` : "";
      return {
        mensaje: `Ya hay un pago de ${formatoMoneda(datos.data.monto, moneda)} de la unidad ${unidad.numero} con fecha ${formatoFecha(e.existente.fecha)}${ref}. Si es otro pago distinto, marca la casilla y vuelve a registrarlo.`,
        valores: {
          duplicado: "si",
          unidadId: datos.data.unidadId,
          monto: aTexto(formData.get("monto")) ?? "",
          fecha: aTexto(formData.get("fecha")) ?? "",
          medio: datos.data.medio,
          referencia: datos.data.referencia ?? "",
        },
      };
    }
    if (e instanceof ErrorCobro) return { mensaje: e.message };
    throw e;
  }
  revalidatePath(`/condominios/${condominioId}`, "layout");
  return { ok: true, mensaje: `Pago de la unidad ${unidad.numero} registrado.` };
}

const AnulacionSchema = z.object({
  motivo: z
    .string({ error: "Escribe por qué se anula." })
    .min(5, { error: "Escribe por qué se anula (al menos 5 letras)." })
    .max(300, { error: "Máximo 300 caracteres." }),
});

/** Anula un pago con un motivo. El pago queda a la vista como anulado; no se borra. */
export async function anularPagoConMotivo(pagoId: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const { usuario, administradoraId } = await requireAdministradora();
  const datos = AnulacionSchema.safeParse({ motivo: aTexto(formData.get("motivo")) });
  if (!datos.success) return erroresDe(datos.error);
  const encontrado = await db.pago.findFirst({
    where: { id: pagoId, administradoraId },
    include: { unidad: { select: { numero: true, condominioId: true } } },
  });
  if (!encontrado || !puedeVerPropiedad(usuario, encontrado.unidad.condominioId)) return { mensaje: "Pago no encontrado." };
  try {
    await anularPago(pagoId, administradoraId, { por: usuario.nombre, motivo: datos.data.motivo }, ({ devuelto }) => ({
      autor: usuario,
      accion: "Anuló un pago",
      detalle: `Unidad ${encontrado.unidad.numero}: ${formatoMoneda(encontrado.monto, usuario.administradora?.moneda)} del ${formatoFecha(encontrado.fecha)}${encontrado.referencia ? ` (ref. ${encontrado.referencia})` : ""}. Motivo: ${datos.data.motivo}`,
      condominioId: encontrado.unidad.condominioId,
      entidad: "Pago",
      entidadId: pagoId,
      antes: { estado: "Vigente", monto: encontrado.monto.toString(), fecha: encontrado.fecha.toISOString() },
      despues: { estado: "Anulado", motivo: datos.data.motivo, devueltoALaDeuda: devuelto },
    }));
  } catch (e) {
    if (e instanceof ErrorCobro) return { mensaje: e.message };
    throw e;
  }
  revalidatePath(`/condominios/${encontrado.unidad.condominioId}`, "layout");
  return { ok: true, mensaje: "Pago anulado." };
}

export async function enviarAvisos(periodoId: string): Promise<EstadoForm> {
  const { usuario, administradoraId } = await requireAdministradora();
  const periodo = await db.periodo.findFirst({ where: { id: periodoId, administradoraId } });
  if (!periodo || !puedeVerPropiedad(usuario, periodo.condominioId)) return { mensaje: "Período no encontrado." };
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
