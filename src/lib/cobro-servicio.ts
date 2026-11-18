import "server-only";
import { MENSAJE_SIN_FINANZAS, operaFinanzas } from "./configuracion";
import { db } from "@/lib/db";
import { registrarEn, type Auditoria } from "@/lib/registro";
import { sincronizarConstanciaEn } from "@/lib/constancias-servicio";
import type { MedioPago } from "@/generated/prisma/enums";
import {
  aMinimo,
  aplicarPago,
  calcularAvisos,
  decimalesMoneda,
  deMinimo,
  diaPagoDe,
  fechaVencimiento,
} from "@/lib/cobro";
import { DistribucionInvalida, validarDistribucion, estadoSegunConciliado, type LineaDistribucion } from "@/lib/conciliacion";

// Operaciones de cobro que tocan la base de datos. Todas reciben administradoraId
// y filtran por él, para que un cliente nunca toque datos de otro.

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

async function monedaDe(tx: Pick<Tx, "administradora">, administradoraId: string) {
  const adm = await tx.administradora.findUniqueOrThrow({ where: { id: administradoraId } });
  return decimalesMoneda(adm.moneda);
}

/** Pagos vigentes de la unidad que aún tienen monto sin aplicar (saldo a favor), del más antiguo al más nuevo. */
async function pagosConSobrante(tx: Tx, unidadId: string, dec: number) {
  const pagos = await tx.pago.findMany({
    where: { unidadId, anuladoEn: null },
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

async function aplicarMonto(tx: Tx, pagoId: string, unidadId: string, monto: number, dec: number, elegidas?: LineaDistribucion[]) {
  const aplicaciones = elegidas ?? (await propuestaAntigua(tx, unidadId, monto, dec));
  for (const ap of aplicaciones) {
    const valor = deMinimo(ap.monto, dec);
    await tx.aplicacionPago.create({ data: { pagoId, avisoId: ap.avisoId, monto: valor } });
    await tx.avisoCobro.update({ where: { id: ap.avisoId }, data: { saldo: { decrement: valor } } });
  }
}

/** Lo de siempre cuando nadie elige: primero la deuda más antigua. */
async function propuestaAntigua(tx: Tx, unidadId: string, monto: number, dec: number) {
  const pendientes = await tx.avisoCobro.findMany({
    where: { unidadId, saldo: { gt: 0 } },
    orderBy: [{ vencimiento: "asc" }, { emitidoEn: "asc" }],
  });
  return aplicarPago(
    monto,
    pendientes.map((a) => ({ id: a.id, saldo: aMinimo(a.saldo.toString(), dec) })),
  ).aplicaciones;
}

/** Avisos con saldo de la unidad, en unidades mínimas (para revisar una distribución elegida). */
async function avisosConSaldo(tx: Tx, unidadId: string, dec: number) {
  const avisos = await tx.avisoCobro.findMany({ where: { unidadId, saldo: { gt: 0 } }, select: { id: true, saldo: true, vencimiento: true } });
  return avisos.map((a) => ({ id: a.id, saldo: aMinimo(a.saldo.toString(), dec), vencimiento: a.vencimiento }));
}

export class ErrorCobro extends Error {}

/** SEG-22: ya hay un pago vigente igual (misma unidad, monto y día). No se guardó nada. */
export class PagoDuplicado extends ErrorCobro {
  constructor(readonly existente: { fecha: Date; referencia: string | null; creadoEn: Date }) {
    super("Ya hay un pago igual registrado para esta unidad.");
  }
}

/** Cómo anotar el cambio en el registro (SEG-25): lo que falta se completa con el resultado. */
type AnotarCon<T> = (resultado: T) => Auditoria;

/**
 * Bloquea las unidades hasta que termine la transacción: si dos personas registran o anulan
 * pagos de la misma unidad a la vez, la segunda operación espera a la primera y lee los saldos
 * ya actualizados. Se bloquean en orden de id para que dos operaciones nunca se esperen entre sí.
 * No cambia ningún cálculo.
 */
export async function bloquearUnidades(tx: Tx, unidadIds: string[]) {
  if (unidadIds.length === 0) return;
  const ids = [...new Set(unidadIds)].sort();
  await tx.$queryRaw`SELECT id FROM "Unidad" WHERE id = ANY(${ids}::text[]) ORDER BY id FOR UPDATE`;
}

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
export async function emitirPeriodo(periodoId: string, administradoraId: string, anotar?: AnotarCon<number>) {
  return db.$transaction(async (tx) => {
    // Bloquear el período: dos cierres a la vez esperan uno al otro y el segundo ve que ya se cerró.
    await tx.$queryRaw`SELECT id FROM "Periodo" WHERE id = ${periodoId} FOR UPDATE`;
    const periodo = await cargarPeriodo(tx, periodoId, administradoraId);
    if (periodo.estado === "CERRADO") throw new ErrorCobro("El período ya fue cerrado.");
    if (!operaFinanzas(periodo.condominio.estado)) throw new ErrorCobro(MENSAJE_SIN_FINANZAS);
    await bloquearUnidades(
      tx,
      periodo.condominio.unidades.map((u) => u.id),
    );
    const { condominio } = periodo;
    const ahora = new Date();
    const { lineas, dec } = await calcularPeriodo(tx, periodo, administradoraId, ahora);

    // Fecha general de la propiedad; cada unidad con día de pago propio vence ese día.
    const vencimiento = fechaVencimiento(periodo.anio, periodo.mes, condominio.diaVencimiento);
    const diaDe = new Map(condominio.unidades.map((u) => [u.id, diaPagoDe(u, condominio)]));
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
          vencimiento: fechaVencimiento(periodo.anio, periodo.mes, diaDe.get(l.unidadId)!),
        },
      });
      await aplicarSaldosAFavor(tx, l.unidadId, dec);
    }

    await tx.periodo.update({
      where: { id: periodoId },
      data: { estado: "CERRADO", cerradoEn: ahora, vencimiento },
    });
    if (anotar) await registrarEn(tx, anotar(lineas.length));
    return lineas.length;
  });
}

type DatosPago = { unidadId: string; monto: number; fecha: Date; medio: MedioPago; referencia?: string };
type OpcionesPago = {
  permitirDuplicado?: boolean;
  anotar?: AnotarCon<{ id: string }>;
  /**
   * FIN-COMP A: qué avisos paga y cuánto a cada uno (en la moneda, no en unidades mínimas). Sin
   * esto se propone lo de siempre (lo más antiguo primero). Lo que no se reparte queda a favor.
   */
  distribucion?: { avisoId: string; monto: number }[];
};

/** Registra un pago y lo aplica según la distribución elegida (o, si no se eligió, a lo más antiguo). */
export async function registrarPago(administradoraId: string, datos: DatosPago, opciones: OpcionesPago = {}) {
  return db.$transaction((tx) => registrarPagoEn(tx, administradoraId, datos, opciones));
}

/**
 * Lo mismo que registrarPago, dentro de una transacción ya abierta. PAG-001 la usa para que el
 * pago, el movimiento de la cartola y la transferencia informada cambien juntos o nada.
 */
export async function registrarPagoEn(tx: Tx, administradoraId: string, datos: DatosPago, opciones: OpcionesPago = {}) {
  {
    const unidad = await tx.unidad.findFirst({
      where: { id: datos.unidadId, administradoraId },
      include: { condominio: { select: { estado: true } } },
    });
    if (!unidad) throw new ErrorCobro("Unidad no encontrada.");
    if (!operaFinanzas(unidad.condominio.estado)) throw new ErrorCobro(MENSAJE_SIN_FINANZAS);
    await bloquearUnidades(tx, [unidad.id]);
    const dec = await monedaDe(tx, administradoraId);
    const monto = aMinimo(datos.monto, dec);
    if (!opciones.permitirDuplicado) {
      // SEG-22: con la unidad bloqueada, para que dos registros iguales a la vez también se detecten.
      const inicio = new Date(datos.fecha);
      inicio.setUTCHours(0, 0, 0, 0);
      const fin = new Date(inicio.getTime() + 24 * 60 * 60 * 1000);
      const igual = await tx.pago.findFirst({
        where: { unidadId: unidad.id, anuladoEn: null, monto: deMinimo(monto, dec), fecha: { gte: inicio, lt: fin } },
        select: { fecha: true, referencia: true, creadoEn: true },
      });
      if (igual) throw new PagoDuplicado(igual);
    }
    // La distribución elegida se revisa ANTES de guardar nada, con la unidad ya bloqueada.
    let elegidas: LineaDistribucion[] | undefined;
    if (opciones.distribucion) {
      try {
        elegidas = validarDistribucion(
          monto,
          opciones.distribucion.map((l) => ({ avisoId: l.avisoId, monto: aMinimo(l.monto, dec) })),
          await avisosConSaldo(tx, unidad.id, dec),
        ).lineas;
      } catch (e) {
        if (e instanceof DistribucionInvalida) throw new ErrorCobro(e.message);
        throw e;
      }
    }
    const pago = await tx.pago.create({
      data: { ...datos, monto: deMinimo(monto, dec), administradoraId },
    });
    await aplicarMonto(tx, pago.id, unidad.id, monto, dec, elegidas);
    if (opciones.anotar) await registrarEn(tx, opciones.anotar(pago));
    return pago;
  }
}

/**
 * Anula un pago: devuelve a los avisos los montos que tenía aplicados y lo marca como anulado.
 * El pago no se borra: queda en la lista con quién lo anuló, cuándo y por qué, y deja de contar
 * para la deuda y el saldo a favor (igual que antes, cuando se eliminaba).
 */
export async function anularPago(
  pagoId: string,
  administradoraId: string,
  anulacion: { por: string; motivo: string; transferencia?: "EN_REVISION" | "ANULADA" },
  anotar?: AnotarCon<{ id: string; devuelto: string }>,
) {
  return db.$transaction((tx) => anularPagoEn(tx, pagoId, administradoraId, anulacion, anotar));
}

/** Lo mismo que anularPago, dentro de una transacción ya abierta. */
export async function anularPagoEn(
  tx: Tx,
  pagoId: string,
  administradoraId: string,
  anulacion: { por: string; motivo: string; transferencia?: "EN_REVISION" | "ANULADA" },
  anotar?: AnotarCon<{ id: string; devuelto: string }>,
) {
  {
    const pago = await tx.pago.findFirst({
      where: { id: pagoId, administradoraId },
    });
    if (!pago) throw new ErrorCobro("Pago no encontrado.");
    await bloquearUnidades(tx, [pago.unidadId]);
    // Marcar primero y solo si sigue vigente: dos anulaciones a la vez no devuelven el monto dos veces.
    const { count } = await tx.pago.updateMany({
      where: { id: pago.id, anuladoEn: null },
      data: { anuladoEn: new Date(), anuladoPor: anulacion.por, motivoAnulacion: anulacion.motivo },
    });
    if (count === 0) throw new ErrorCobro("Ese pago ya estaba anulado.");
    // Releer lo aplicado ya con la unidad bloqueada: otra operación pudo usar su saldo a favor.
    const aplicaciones = await tx.aplicacionPago.findMany({ where: { pagoId: pago.id } });
    for (const ap of aplicaciones) {
      await tx.avisoCobro.update({ where: { id: ap.avisoId }, data: { saldo: { increment: ap.monto } } });
    }
    await tx.aplicacionPago.deleteMany({ where: { pagoId: pago.id } });
    // FIN-COMP A: el movimiento de la cartola que lo respaldaba vuelve a quedar disponible (la
    // conciliación queda anulada, no se borra) y, si venía de una transferencia informada, esta
    // vuelve a revisión o queda «Anulado o reversado», según se eligió.
    await liberarConciliaciones(tx, pago.id, anulacion);
    await liberarTransferencia(tx, pago.id, anulacion);
    // Si la unidad tenía otros saldos a favor, ahora pueden cubrir lo que quedó pendiente.
    const dec = await monedaDe(tx, administradoraId);
    await aplicarSaldosAFavor(tx, pago.unidadId, dec);
    if (anotar) {
      const devuelto = deMinimo(aplicaciones.reduce((s, a) => s + aMinimo(a.monto.toString(), dec), 0), dec);
      await registrarEn(tx, anotar({ id: pago.id, devuelto: String(devuelto) }));
    }
    return pago;
  }
}

/**
 * Anula las conciliaciones vigentes de un pago y devuelve ese monto al movimiento de la cartola.
 * También la usa «deshacer conciliación» (conciliacion-servicio.ts).
 */
export async function liberarConciliaciones(tx: Tx, pagoId: string, anulacion: { por: string; motivo: string }) {
  const vigentes = await tx.conciliacionMovimiento.findMany({ where: { pagoId, anuladaEn: null } });
  for (const c of vigentes) await anularConciliacionEn(tx, c.id, anulacion);
}

/** Marca anulada una conciliación (sin borrarla) y descuenta su monto del movimiento. */
export async function anularConciliacionEn(tx: Tx, conciliacionId: string, anulacion: { por: string; motivo: string }) {
  const { count } = await tx.conciliacionMovimiento.updateMany({
    where: { id: conciliacionId, anuladaEn: null },
    data: { anuladaEn: new Date(), anuladaPor: anulacion.por, motivoAnulacion: anulacion.motivo.slice(0, 500) },
  });
  if (count === 0) throw new ErrorCobro("Esa conciliación ya estaba deshecha.");
  const c = await tx.conciliacionMovimiento.findUniqueOrThrow({ where: { id: conciliacionId } });
  await tx.$queryRaw`SELECT id FROM "MovimientoBancario" WHERE id = ${c.movimientoId} FOR UPDATE`;
  const m = await tx.movimientoBancario.update({
    where: { id: c.movimientoId },
    data: { montoConciliado: { decrement: c.monto } },
    select: { id: true, monto: true, montoConciliado: true },
  });
  await tx.movimientoBancario.update({
    where: { id: m.id },
    data: { estado: estadoSegunConciliado(Number(m.monto), Number(m.montoConciliado)) },
  });
  return c;
}

async function liberarTransferencia(tx: Tx, pagoId: string, anulacion: { por: string; motivo: string; transferencia?: "EN_REVISION" | "ANULADA" }) {
  const t = await tx.transferenciaInformada.findUnique({ where: { pagoId }, select: { id: true, estado: true, movimientoId: true, administradoraId: true, condominioId: true } });
  if (!t) return;
  const destino = anulacion.transferencia ?? "EN_REVISION";
  await tx.registroCambio.create({
    data: {
      administradoraId: t.administradoraId,
      condominioId: t.condominioId,
      usuarioNombre: anulacion.por,
      accion: destino === "ANULADA" ? "Reversó el pago de una transferencia" : "Volvió a revisión por anulación del pago",
      detalle: `${destino === "ANULADA" ? "Pago reversado" : "El pago de la transferencia se anuló en Recaudación"}: ${anulacion.motivo}`.slice(0, 1000),
      entidad: "TransferenciaInformada",
      entidadId: t.id,
      antes: { estado: t.estado, pagoId, movimientoId: t.movimientoId },
      despues: { estado: destino },
    },
  });
  await tx.transferenciaInformada.update({
    where: { id: t.id },
    data: {
      estado: destino,
      pagoId: null,
      movimientoId: null,
      nota: `${destino === "ANULADA" ? "Pago reversado" : "El pago se anuló en Recaudación"} (${anulacion.por}): ${anulacion.motivo}`.slice(0, 500),
      revisadoPor: anulacion.por,
      revisadoEn: new Date(),
    },
  });
  await sincronizarConstanciaEn(tx, t.id, anulacion.por);
}

/**
 * Estado de cuenta de una unidad: avisos, pagos, deuda y saldo a favor. FIN-COMP A: también los
 * pagos informados que siguen PENDIENTES DE VERIFICACIÓN. Se muestran aparte y nunca se restan de
 * la deuda ni se suman a lo pagado: solo cuentan cuando la administración los verifica.
 */
export async function estadoCuenta(unidadId: string, administradoraId: string) {
  const unidad = await db.unidad.findFirst({ where: { id: unidadId, administradoraId } });
  if (!unidad) return null;
  const dec = await monedaDe(db, administradoraId);
  const [avisos, pagos, enVerificacion] = await Promise.all([
    db.avisoCobro.findMany({
      where: { unidadId },
      orderBy: [{ vencimiento: "desc" }],
      include: { periodo: { select: { anio: true, mes: true } } },
    }),
    db.pago.findMany({
      where: { unidadId },
      orderBy: [{ fecha: "desc" }, { creadoEn: "desc" }],
      include: {
        aplicaciones: { select: { monto: true, aviso: { select: { periodo: { select: { anio: true, mes: true } } } } } },
        conciliaciones: { where: { anuladaEn: null }, select: { id: true, movimiento: { select: { fecha: true } } } },
        transferencia: { select: { id: true, estado: true } },
      },
    }),
    db.transferenciaInformada.findMany({
      where: { unidadId, administradoraId, estado: { in: ["INFORMADA", "EN_REVISION"] } },
      orderBy: { creadoEn: "desc" },
      select: { id: true, fecha: true, monto: true, operacion: true, estado: true, creadoEn: true, informante: true, comprobante: { select: { id: true } } },
    }),
  ]);
  const ahora = new Date();
  const deuda = avisos.reduce((s, a) => s + aMinimo(a.saldo.toString(), dec), 0);
  const vencida = avisos
    .filter((a) => a.vencimiento < ahora)
    .reduce((s, a) => s + aMinimo(a.saldo.toString(), dec), 0);
  const vigentes = pagos.filter((p) => !p.anuladoEn);
  const aFavor = vigentes.reduce(
    (s, p) =>
      s + aMinimo(p.monto.toString(), dec) - p.aplicaciones.reduce((t, a) => t + aMinimo(a.monto.toString(), dec), 0),
    0,
  );
  const pagado = vigentes.reduce((s, p) => s + aMinimo(p.monto.toString(), dec), 0);
  const pendiente = enVerificacion.reduce((s, t) => s + aMinimo(t.monto.toString(), dec), 0);
  return {
    avisos,
    pagos,
    deuda: deMinimo(deuda, dec),
    vencida: deMinimo(vencida, dec),
    aFavor: deMinimo(aFavor, dec),
    /** Pagos efectivamente registrados (vigentes, sin anulados). */
    pagado: deMinimo(pagado, dec),
    /** Pagos informados todavía sin verificar: visibles, pero NO descuentan deuda. */
    enVerificacion: { lista: enVerificacion, cantidad: enVerificacion.length, monto: deMinimo(pendiente, dec) },
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
