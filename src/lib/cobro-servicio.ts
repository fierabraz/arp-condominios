import "server-only";
import { db } from "@/lib/db";
import type { MedioPago } from "@/generated/prisma/enums";
import {
  aMinimo,
  aplicarPago,
  calcularAvisos,
  decimalesMoneda,
  deMinimo,
  fechaVencimiento,
} from "@/lib/cobro";

// Operaciones de cobro que tocan la base de datos. Todas reciben administradoraId
// y filtran por él, para que un cliente nunca toque datos de otro.

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

async function monedaDe(tx: Pick<Tx, "administradora">, administradoraId: string) {
  const adm = await tx.administradora.findUniqueOrThrow({ where: { id: administradoraId } });
  return decimalesMoneda(adm.moneda);
}

/** Pagos de la unidad que aún tienen monto sin aplicar (saldo a favor), del más antiguo al más nuevo. */
async function pagosConSobrante(tx: Tx, unidadId: string, dec: number) {
  const pagos = await tx.pago.findMany({
    where: { unidadId },
    orderBy: [{ fecha: "asc" }, { creadoEn: "asc" }],
    include: { aplicaciones: { select: { monto: true } } },
  });
  return pagos
    .map((p) => ({
      id: p.id,
      sobrante: aMinimo(p.monto.toString(), dec) - p.aplicaciones.reduce((s, a) => s + aMinimo(a.monto.toString(), dec), 0),
    }))
    .filter((p) => p.sobrante > 0);
}

/** Aplica los saldos a favor de una unidad a sus avisos pendientes. */
async function aplicarSaldosAFavor(tx: Tx, unidadId: string, dec: number) {
  const pagos = await pagosConSobrante(tx, unidadId, dec);
  for (const pago of pagos) {
    await aplicarMonto(tx, pago.id, unidadId, pago.sobrante, dec);
  }
}

async function aplicarMonto(tx: Tx, pagoId: string, unidadId: string, monto: number, dec: number) {
  const pendientes = await tx.avisoCobro.findMany({
    where: { unidadId, saldo: { gt: 0 } },
    orderBy: [{ vencimiento: "asc" }, { emitidoEn: "asc" }],
  });
  const { aplicaciones } = aplicarPago(
    monto,
    pendientes.map((a) => ({ id: a.id, saldo: aMinimo(a.saldo.toString(), dec) })),
  );
  for (const ap of aplicaciones) {
    const valor = deMinimo(ap.monto, dec);
    await tx.aplicacionPago.create({ data: { pagoId, avisoId: ap.avisoId, monto: valor } });
    await tx.avisoCobro.update({ where: { id: ap.avisoId }, data: { saldo: { decrement: valor } } });
  }
}

export class ErrorCobro extends Error {}

async function cargarPeriodo(tx: Tx, periodoId: string, administradoraId: string) {
  const periodo = await tx.periodo.findFirst({
    where: { id: periodoId, administradoraId },
    include: {
      condominio: { include: { unidades: { orderBy: { numero: "asc" } } } },
      gastos: true,
    },
  });
  if (!periodo) throw new ErrorCobro("Período no encontrado.");
  return periodo;
}

/** Calcula los avisos que se emitirían para el período, sin guardar nada. */
async function calcularPeriodo(
  tx: Tx,
  periodo: Awaited<ReturnType<typeof cargarPeriodo>>,
  administradoraId: string,
  ahora: Date,
) {
  const { condominio } = periodo;
  if (condominio.unidades.length === 0) throw new ErrorCobro("El condominio no tiene unidades.");

  const dec = await monedaDe(tx, administradoraId);
  const totalComun = periodo.gastos
    .filter((g) => g.tipo === "COMUN")
    .reduce((s, g) => s + aMinimo(g.monto.toString(), dec), 0);

  const unidades = await Promise.all(
    condominio.unidades.map(async (u) => {
      const cargos = periodo.gastos
        .filter((g) => g.tipo === "INDIVIDUAL" && g.unidadId === u.id)
        .reduce((s, g) => s + aMinimo(g.monto.toString(), dec), 0);
      const vencidos = await tx.avisoCobro.findMany({
        where: { unidadId: u.id, saldo: { gt: 0 }, vencimiento: { lt: ahora } },
        select: { saldo: true },
      });
      return {
        id: u.id,
        alicuota: Number(u.alicuota),
        cargosIndividuales: cargos,
        deudaVencida: vencidos.reduce((s, a) => s + aMinimo(a.saldo.toString(), dec), 0),
      };
    }),
  );

  try {
    const lineas = calcularAvisos({
      totalGastosComunes: totalComun,
      porcentajeReserva: Number(condominio.porcentajeReserva),
      tasaInteresMora: Number(condominio.tasaInteresMora),
      unidades,
    });
    return { lineas, dec };
  } catch (e) {
    throw new ErrorCobro((e as Error).message);
  }
}

/** Vista previa de los avisos de un período abierto, en la moneda (no en unidades mínimas). */
export async function previsualizarPeriodo(periodoId: string, administradoraId: string) {
  return db.$transaction(async (tx) => {
    const periodo = await cargarPeriodo(tx, periodoId, administradoraId);
    const { lineas, dec } = await calcularPeriodo(tx, periodo, administradoraId, new Date());
    return lineas.map((l) => ({
      unidadId: l.unidadId,
      gastoComun: deMinimo(l.gastoComun, dec),
      fondoReserva: deMinimo(l.fondoReserva, dec),
      cargos: deMinimo(l.cargos, dec),
      interes: deMinimo(l.interes, dec),
      total: deMinimo(l.total, dec),
    }));
  });
}

/** Cierra el período y emite un aviso de cobro por unidad. */
export async function emitirPeriodo(periodoId: string, administradoraId: string) {
  return db.$transaction(async (tx) => {
    const periodo = await cargarPeriodo(tx, periodoId, administradoraId);
    if (periodo.estado === "CERRADO") throw new ErrorCobro("El período ya fue cerrado.");
    const { condominio } = periodo;
    const ahora = new Date();
    const { lineas, dec } = await calcularPeriodo(tx, periodo, administradoraId, ahora);

    const vencimiento = fechaVencimiento(periodo.anio, periodo.mes, condominio.diaVencimiento);
    for (const l of lineas) {
      const total = deMinimo(l.total, dec);
      await tx.avisoCobro.create({
        data: {
          administradoraId,
          periodoId,
          unidadId: l.unidadId,
          gastoComun: deMinimo(l.gastoComun, dec),
          fondoReserva: deMinimo(l.fondoReserva, dec),
          cargos: deMinimo(l.cargos, dec),
          interes: deMinimo(l.interes, dec),
          total,
          saldo: total,
          vencimiento,
        },
      });
      await aplicarSaldosAFavor(tx, l.unidadId, dec);
    }

    await tx.periodo.update({
      where: { id: periodoId },
      data: { estado: "CERRADO", cerradoEn: ahora, vencimiento },
    });
    return lineas.length;
  });
}

/** Registra un pago y lo aplica a la deuda más antigua de la unidad. */
export async function registrarPago(
  administradoraId: string,
  datos: { unidadId: string; monto: number; fecha: Date; medio: MedioPago; referencia?: string },
) {
  return db.$transaction(async (tx) => {
    const unidad = await tx.unidad.findFirst({ where: { id: datos.unidadId, administradoraId } });
    if (!unidad) throw new ErrorCobro("Unidad no encontrada.");
    const dec = await monedaDe(tx, administradoraId);
    const monto = aMinimo(datos.monto, dec);
    const pago = await tx.pago.create({
      data: { ...datos, monto: deMinimo(monto, dec), administradoraId },
    });
    await aplicarMonto(tx, pago.id, unidad.id, monto, dec);
    return pago;
  });
}

/** Anula un pago: devuelve los montos aplicados a los avisos y lo elimina. */
export async function anularPago(pagoId: string, administradoraId: string) {
  return db.$transaction(async (tx) => {
    const pago = await tx.pago.findFirst({
      where: { id: pagoId, administradoraId },
      include: { aplicaciones: true },
    });
    if (!pago) throw new ErrorCobro("Pago no encontrado.");
    for (const ap of pago.aplicaciones) {
      await tx.avisoCobro.update({ where: { id: ap.avisoId }, data: { saldo: { increment: ap.monto } } });
    }
    await tx.pago.delete({ where: { id: pago.id } });
    // Si la unidad tenía otros saldos a favor, ahora pueden cubrir lo que quedó pendiente.
    await aplicarSaldosAFavor(tx, pago.unidadId, await monedaDe(tx, administradoraId));
    return pago;
  });
}

/** Estado de cuenta de una unidad: avisos, pagos, deuda y saldo a favor. */
export async function estadoCuenta(unidadId: string, administradoraId: string) {
  const unidad = await db.unidad.findFirst({ where: { id: unidadId, administradoraId } });
  if (!unidad) return null;
  const dec = await monedaDe(db, administradoraId);
  const [avisos, pagos] = await Promise.all([
    db.avisoCobro.findMany({
      where: { unidadId },
      orderBy: [{ vencimiento: "desc" }],
      include: { periodo: { select: { anio: true, mes: true } } },
    }),
    db.pago.findMany({
      where: { unidadId },
      orderBy: [{ fecha: "desc" }, { creadoEn: "desc" }],
      include: { aplicaciones: { select: { monto: true } } },
    }),
  ]);
  const ahora = new Date();
  const deuda = avisos.reduce((s, a) => s + aMinimo(a.saldo.toString(), dec), 0);
  const vencida = avisos
    .filter((a) => a.vencimiento < ahora)
    .reduce((s, a) => s + aMinimo(a.saldo.toString(), dec), 0);
  const aFavor = pagos.reduce(
    (s, p) =>
      s + aMinimo(p.monto.toString(), dec) - p.aplicaciones.reduce((t, a) => t + aMinimo(a.monto.toString(), dec), 0),
    0,
  );
  return {
    avisos,
    pagos,
    deuda: deMinimo(deuda, dec),
    vencida: deMinimo(vencida, dec),
    aFavor: deMinimo(aFavor, dec),
  };
}

/** Unidades del condominio con deuda vencida, de mayor a menor. */
export async function morosidad(condominioId: string, administradoraId: string) {
  const ahora = new Date();
  const avisos = await db.avisoCobro.findMany({
    where: { administradoraId, unidad: { condominioId }, saldo: { gt: 0 }, vencimiento: { lt: ahora } },
    include: { unidad: { select: { id: true, numero: true } } },
  });
  const porUnidad = new Map<string, { unidadId: string; numero: string; deuda: number; avisos: number; desde: Date }>();
  for (const a of avisos) {
    const fila = porUnidad.get(a.unidadId) ?? {
      unidadId: a.unidadId,
      numero: a.unidad.numero,
      deuda: 0,
      avisos: 0,
      desde: a.vencimiento,
    };
    fila.deuda = Math.round((fila.deuda + Number(a.saldo)) * 100) / 100;
    fila.avisos += 1;
    if (a.vencimiento < fila.desde) fila.desde = a.vencimiento;
    porUnidad.set(a.unidadId, fila);
  }
  return [...porUnidad.values()].sort((a, b) => b.deuda - a.deuda);
}
