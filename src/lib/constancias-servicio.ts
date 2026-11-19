import "server-only";
// PILOTO-001 · Constancias de pago informado: folio, versiones y consulta pública por QR.

import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { nombrePeriodo } from "@/lib/cobro";
import {
  claveVersion,
  huellaConstancia,
  type DatosConstancia,
  type EstadoConstancia,
} from "@/lib/constancias";

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

const dia = (f: Date) => f.toISOString().slice(0, 10);
const num = (v: { toString(): string }) => Number(v.toString());

/** Datos actuales de la transferencia, en la forma de una versión (sin folio ni número todavía). */
async function datosActuales(tx: Tx, transferenciaId: string) {
  const t = await tx.transferenciaInformada.findUniqueOrThrow({
    where: { id: transferenciaId },
    include: {
      unidad: { select: { numero: true, condominio: { select: { nombre: true, administradora: { select: { moneda: true } } } } } },
      movimiento: { select: { fecha: true } },
      pago: {
        select: {
          monto: true,
          anuladoEn: true,
          aplicaciones: { select: { monto: true, aviso: { select: { periodo: { select: { anio: true, mes: true } } } } } },
          conciliaciones: { where: { anuladaEn: null }, select: { movimiento: { select: { fecha: true } } }, take: 1 },
        },
      },
    },
  });
  const pago = t.pago && !t.pago.anuladoEn ? t.pago : null;
  const confirmada = t.estado === "CONCILIADA" && pago;
  const aplicaciones = confirmada
    ? pago.aplicaciones
        .map((a) => ({ detalle: `Gastos comunes de ${nombrePeriodo(a.aviso.periodo.anio, a.aviso.periodo.mes)}`, monto: num(a.monto), orden: a.aviso.periodo.anio * 100 + a.aviso.periodo.mes }))
        .sort((a, b) => a.orden - b.orden)
        .map(({ detalle, monto }) => ({ detalle, monto }))
    : [];
  const montoConfirmado = confirmada ? num(pago.monto) : null;
  const aplicado = aplicaciones.reduce((s, a) => s + a.monto, 0);
  const saldoAFavor = montoConfirmado !== null && montoConfirmado - aplicado > 0.004 ? Math.round((montoConfirmado - aplicado) * 100) / 100 : null;
  const fechaMov = t.movimiento?.fecha ?? (confirmada ? pago.conciliaciones[0]?.movimiento.fecha : undefined);
  return {
    t,
    datos: {
      estado: t.estado as EstadoConstancia,
      comunidad: t.unidad.condominio.nombre,
      unidad: t.unidad.numero,
      informante: t.informante,
      pagadoPor: t.pagadoPor,
      moneda: t.unidad.condominio.administradora.moneda,
      montoInformado: num(t.monto),
      montoConfirmado,
      fechaTransferencia: dia(t.fecha),
      referencia: t.operacion,
      bancoOrigen: t.bancoOrigen,
      informadaEn: t.creadoEn.toISOString(),
      verificadaEn: confirmada && t.revisadoEn ? t.revisadoEn.toISOString() : null,
      fechaMovimiento: confirmada && fechaMov ? dia(fechaMov) : null,
      aplicaciones,
      saldoAFavor,
      nota: t.estado === "INFORMADA" ? null : t.nota,
    },
  };
}

/**
 * Deja la constancia al día con el estado de la transferencia: la crea con su folio si no existe
 * y agrega una versión si algo cambió. Llamar dentro de la misma transacción que cambia el estado,
 * después del cambio. Nunca modifica versiones anteriores.
 */
export async function sincronizarConstanciaEn(tx: Tx, transferenciaId: string, por: string) {
  const { t, datos } = await datosActuales(tx, transferenciaId);
  let constancia = await tx.constanciaPago.findUnique({
    where: { transferenciaId },
    include: { versiones: { orderBy: { version: "asc" }, select: { version: true, estado: true, generadaEn: true, datos: true } } },
  });
  if (!constancia) {
    const creada = await tx.constanciaPago.create({
      data: { administradoraId: t.administradoraId, condominioId: t.condominioId, transferenciaId, codigo: randomBytes(16).toString("base64url") },
    });
    constancia = { ...creada, versiones: [] };
  }
  const ultima = constancia.versiones.at(-1);
  if (ultima && claveVersion(ultima.datos as unknown as DatosConstancia) === claveVersion({ ...datos })) return constancia;
  const version = (ultima?.version ?? 0) + 1;
  const completo: DatosConstancia = {
    folio: constancia.folio,
    version,
    ...datos,
    emitidaEn: new Date().toISOString(),
    historial: constancia.versiones.map((v) => ({ version: v.version, estado: v.estado as EstadoConstancia, emitidaEn: v.generadaEn.toISOString() })),
  };
  await tx.constanciaVersion.create({
    data: {
      constanciaId: constancia.id,
      version,
      estado: datos.estado,
      datos: completo,
      huella: huellaConstancia(completo),
      generadaPor: por,
      generadaEn: new Date(completo.emitidaEn),
    },
  });
  return constancia;
}

/** Versiones de la constancia de una transferencia (crea la primera si es una transferencia antigua). */
export async function constanciaDeTransferencia(transferenciaId: string, por: string) {
  const existente = await db.constanciaPago.findUnique({ where: { transferenciaId }, select: { id: true } });
  if (!existente) {
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "TransferenciaInformada" WHERE id = ${transferenciaId} FOR UPDATE`;
      await sincronizarConstanciaEn(tx, transferenciaId, por);
    });
  }
  return db.constanciaPago.findUniqueOrThrow({
    where: { transferenciaId },
    include: { versiones: { orderBy: { version: "asc" } } },
  });
}

/**
 * Consulta pública por el código del QR. Devuelve solo lo necesario para saber si el documento es
 * auténtico y cuál es su estado vigente: sin nombres, RUT, unidad ni referencia bancaria.
 */
export async function consultaPublicaConstancia(codigo: string) {
  if (!/^[\w-]{20,40}$/.test(codigo)) return null;
  const c = await db.constanciaPago.findUnique({
    where: { codigo },
    select: {
      folio: true,
      versiones: { orderBy: { version: "asc" }, select: { version: true, estado: true, generadaEn: true, huella: true, datos: true } },
    },
  });
  if (!c || c.versiones.length === 0) return null;
  const vigente = c.versiones.at(-1)!;
  const d = vigente.datos as unknown as DatosConstancia;
  return {
    folio: c.folio,
    comunidad: d.comunidad,
    moneda: d.moneda,
    estado: vigente.estado as EstadoConstancia,
    montoInformado: d.montoInformado,
    montoConfirmado: d.montoConfirmado,
    fechaTransferencia: d.fechaTransferencia,
    versiones: c.versiones.map((v) => ({ version: v.version, estado: v.estado as EstadoConstancia, generadaEn: v.generadaEn, huella: v.huella })),
  };
}
