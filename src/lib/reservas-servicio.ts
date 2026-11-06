import "server-only";
import { db } from "@/lib/db";
import { operaAdministracion } from "@/lib/configuracion";
import { formatoDia, formatoMoneda } from "@/lib/formato";
import { nombrePeriodo } from "@/lib/cobro";
import {
  calendarioMes,
  CATEGORIA_GASTO_RESERVA,
  diaDeFecha,
  diaTexto,
  esDia,
  leerMes,
  mesTexto,
  mesVecino,
  ventanaReserva,
  estadoInicial,
  ESTADOS_QUE_OCUPAN,
  fechaDeDia,
  diasEnMes,
  motivoNoCancelable,
  motivoNoReservable,
  periodoParaCargo,
  textoReservaHecha,
  type CobroReserva,
} from "@/lib/reservas";

// RES-001 · Operaciones de reservas que tocan la base de datos. Todas reciben administradoraId
// y filtran por él. Crear y aprobar se hacen con el espacio bloqueado (FOR UPDATE): si dos
// personas piden el mismo turno a la vez, la segunda espera y ve que ya está tomado.

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

export class ErrorReserva extends Error {}

async function bloquearEspacio(tx: Tx, espacioId: string) {
  await tx.$queryRaw`SELECT id FROM "EspacioReservable" WHERE id = ${espacioId} FOR UPDATE`;
}

function rangoMes(dia: string) {
  const anio = +dia.slice(0, 4);
  const mes = +dia.slice(5, 7);
  return {
    gte: new Date(Date.UTC(anio, mes - 1, 1)),
    lte: new Date(Date.UTC(anio, mes - 1, diasEnMes(anio, mes))),
  };
}

/**
 * Si la reserva está confirmada y tiene costo, agrega el cargo a la unidad en el mes que
 * corresponde (el de la reserva si está abierto, o el siguiente abierto). Si todavía no hay
 * un mes abierto, queda "por cargar" y se agrega cuando se abra (cargarCobrosPendientes).
 */
async function cargarCobro(tx: Tx, reservaId: string) {
  const r = await tx.reserva.findUniqueOrThrow({ where: { id: reservaId }, include: { espacio: { select: { nombre: true } } } });
  if (r.estado !== "CONFIRMADA" || Number(r.monto) <= 0 || r.cobro === "CARGADO") return null;
  const periodos = await tx.periodo.findMany({
    where: { condominioId: r.condominioId },
    select: { id: true, anio: true, mes: true, estado: true },
  });
  const periodo = periodoParaCargo(diaDeFecha(r.fecha), periodos);
  if (!periodo) {
    await tx.reserva.update({ where: { id: r.id }, data: { cobro: "POR_CARGAR" } });
    return null;
  }
  const gasto = await tx.gasto.create({
    data: {
      administradoraId: r.administradoraId,
      periodoId: periodo.id,
      tipo: "INDIVIDUAL",
      unidadId: r.unidadId,
      categoria: CATEGORIA_GASTO_RESERVA,
      descripcion: `Reserva ${r.espacio.nombre}, ${formatoDia(r.fecha)} (${r.turno})`,
      monto: r.monto,
      fecha: r.fecha,
    },
  });
  await tx.reserva.update({ where: { id: r.id }, data: { cobro: "CARGADO", gastoId: gasto.id } });
  return periodo;
}

/** Agrega al mes recién abierto los cargos de reservas que esperaban un mes abierto. */
export async function cargarCobrosPendientes(condominioId: string, administradoraId: string) {
  return db.$transaction(async (tx) => {
    const pendientes = await tx.reserva.findMany({
      where: { condominioId, administradoraId, estado: "CONFIRMADA", cobro: "POR_CARGAR" },
      select: { id: true },
    });
    let cargados = 0;
    for (const p of pendientes) if (await cargarCobro(tx, p.id)) cargados++;
    return cargados;
  });
}

export type DatosNuevaReserva = {
  espacioId: string;
  unidadId: string;
  dia: string;
  turno: string;
  observaciones?: string;
  solicitadaPor: string;
  porAdministracion: boolean;
  hoy: string;
};

export async function crearReserva(administradoraId: string, d: DatosNuevaReserva) {
  return db.$transaction(async (tx) => {
    const espacio = await tx.espacioReservable.findFirst({
      where: { id: d.espacioId, administradoraId },
      include: { condominio: { select: { estado: true } } },
    });
    if (!espacio) throw new ErrorReserva("Espacio no encontrado.");
    if (!operaAdministracion(espacio.condominio.estado)) {
      throw new ErrorReserva("Esta propiedad todavía está en configuración: aún no se pueden hacer reservas.");
    }
    const unidad = await tx.unidad.findFirst({ where: { id: d.unidadId, condominioId: espacio.condominioId } });
    if (!unidad) throw new ErrorReserva("Unidad no encontrada.");

    await bloquearEspacio(tx, espacio.id);
    const fecha = fechaDeDia(d.dia);
    const [tomado, delMes, vencidos] = await Promise.all([
      tx.reserva.count({ where: { espacioId: espacio.id, fecha, turno: d.turno, estado: { in: ESTADOS_QUE_OCUPAN } } }),
      tx.reserva.count({
        where: { espacioId: espacio.id, unidadId: unidad.id, fecha: rangoMes(d.dia), estado: { in: ESTADOS_QUE_OCUPAN } },
      }),
      tx.avisoCobro.count({ where: { unidadId: unidad.id, saldo: { gt: 0 }, vencimiento: { lt: new Date() } } }),
    ]);
    const motivo = motivoNoReservable(espacio, {
      dia: d.dia,
      turno: d.turno,
      hoy: d.hoy,
      turnoTomado: tomado > 0,
      reservasDelMes: delMes,
      deudaVencida: vencidos,
      porAdministracion: d.porAdministracion,
    });
    if (motivo) throw new ErrorReserva(motivo);

    const estado = estadoInicial(espacio.requiereAprobacion, d.porAdministracion);
    const conCosto = Number(espacio.costo) > 0;
    const reserva = await tx.reserva.create({
      data: {
        administradoraId,
        condominioId: espacio.condominioId,
        espacioId: espacio.id,
        unidadId: unidad.id,
        fecha,
        turno: d.turno,
        estado,
        monto: espacio.costo,
        cobro: conCosto ? "POR_CARGAR" : "SIN_COBRO",
        observaciones: d.observaciones,
        solicitadaPor: d.solicitadaPor,
        porAdministracion: d.porAdministracion,
        ...(estado === "CONFIRMADA" ? { respondidaPor: d.solicitadaPor, respondidaEn: new Date() } : {}),
      },
    });
    const periodo = await cargarCobro(tx, reserva.id);
    return { reserva, espacio, unidad, periodo };
  });
}

async function reservaPropia(tx: Tx, id: string, administradoraId: string) {
  const r = await tx.reserva.findFirst({
    where: { id, administradoraId },
    include: {
      espacio: { select: { nombre: true } },
      unidad: { select: { numero: true } },
      gasto: { include: { periodo: { select: { anio: true, mes: true, estado: true } } } },
    },
  });
  if (!r) throw new ErrorReserva("Reserva no encontrada.");
  return r;
}

/** La administración aprueba una reserva que esperaba aprobación. */
export async function confirmarReserva(id: string, administradoraId: string, por: string) {
  return db.$transaction(async (tx) => {
    const r = await reservaPropia(tx, id, administradoraId);
    await bloquearEspacio(tx, r.espacioId);
    const { count } = await tx.reserva.updateMany({
      where: { id, estado: "PENDIENTE" },
      data: { estado: "CONFIRMADA", respondidaPor: por, respondidaEn: new Date() },
    });
    if (count === 0) throw new ErrorReserva("Esta reserva ya fue respondida.");
    const periodo = await cargarCobro(tx, id);
    return { reserva: r, periodo };
  });
}

/** La administración rechaza una reserva que esperaba aprobación. Libera el turno. */
export async function rechazarReserva(id: string, administradoraId: string, por: string, motivo: string) {
  return db.$transaction(async (tx) => {
    const r = await reservaPropia(tx, id, administradoraId);
    const { count } = await tx.reserva.updateMany({
      where: { id, estado: "PENDIENTE" },
      data: {
        estado: "RECHAZADA",
        respondidaPor: por,
        respondidaEn: new Date(),
        motivo,
        cobro: r.cobro === "SIN_COBRO" ? "SIN_COBRO" : "ANULADO",
      },
    });
    if (count === 0) throw new ErrorReserva("Esta reserva ya fue respondida.");
    return r;
  });
}

/**
 * Cancela una reserva vigente y libera el turno. Si su cargo está en un mes todavía abierto,
 * se quita. Si el mes ya se emitió, el cargo se mantiene (el aviso no se cambia): solo la
 * administración puede cancelarla en ese caso, y la devolución se hace aparte.
 */
export async function cancelarReserva(
  id: string,
  administradoraId: string,
  d: { por: string; motivo?: string; porAdministracion: boolean; hoy: string; unidadesPermitidas?: string[] },
) {
  return db.$transaction(async (tx) => {
    const r = await reservaPropia(tx, id, administradoraId);
    if (d.unidadesPermitidas && !d.unidadesPermitidas.includes(r.unidadId)) throw new ErrorReserva("Reserva no encontrada.");
    const periodoCargoCerrado = r.gasto?.periodo.estado === "CERRADO";
    const motivo = motivoNoCancelable(
      { estado: r.estado, fecha: diaDeFecha(r.fecha), cobro: r.cobro, periodoCargoCerrado },
      d.hoy,
      d.porAdministracion,
    );
    if (motivo) throw new ErrorReserva(motivo);

    let cobro: CobroReserva = r.cobro;
    let cargoQuitado = false;
    if (r.cobro === "CARGADO" && r.gasto && !periodoCargoCerrado) {
      await tx.reserva.update({ where: { id }, data: { gastoId: null } });
      await tx.gasto.delete({ where: { id: r.gasto.id } });
      cobro = "ANULADO";
      cargoQuitado = true;
    } else if (r.cobro === "POR_CARGAR" || (r.cobro === "CARGADO" && !r.gasto)) {
      cobro = "ANULADO";
    }
    const { count } = await tx.reserva.updateMany({
      where: { id, estado: { in: ESTADOS_QUE_OCUPAN } },
      data: { estado: "CANCELADA", motivo: d.motivo, respondidaPor: d.por, respondidaEn: new Date(), cobro },
    });
    if (count === 0) throw new ErrorReserva("Esta reserva ya no está vigente.");
    return { reserva: r, cargoQuitado, cargoSeMantiene: r.cobro === "CARGADO" && periodoCargoCerrado };
  });
}

/** Reservas que ocupan turnos de un espacio en un rango de días (para el calendario). */
export async function reservasEnRango(espacioId: string, desde: string, hasta: string) {
  return db.reserva.findMany({
    where: { espacioId, fecha: { gte: fechaDeDia(desde), lte: fechaDeDia(hasta) }, estado: { in: ESTADOS_QUE_OCUPAN } },
    orderBy: [{ fecha: "asc" }, { turno: "asc" }],
    include: { unidad: { select: { numero: true } } },
  });
}

/**
 * Lo que necesita el calendario de un espacio: el mes pedido (?mes=AAAA-MM), sus días con
 * su estado y, si se eligió un día (?dia=AAAA-MM-DD), sus turnos libres y sus reservas.
 * El residente no puede ir a meses pasados ni más allá del plazo para reservar.
 */
export async function calendarioEspacio(
  espacio: { id: string; turnos: string[]; anticipacionMaximaDias: number },
  pedido: { mes?: unknown; dia?: unknown },
  hoy: string,
  opciones: { soloFuturo: boolean },
) {
  const { hasta } = ventanaReserva(hoy, espacio.anticipacionMaximaDias);
  const diaPedido = esDia(pedido.dia) ? pedido.dia : undefined;
  let { anio, mes } = leerMes(pedido.mes ?? diaPedido?.slice(0, 7), hoy);
  const actual = mesTexto(+hoy.slice(0, 4), +hoy.slice(5, 7));
  const ultimo = hasta.slice(0, 7);
  if (opciones.soloFuturo) {
    if (mesTexto(anio, mes) < actual) ({ anio, mes } = leerMes(actual, hoy));
    if (mesTexto(anio, mes) > ultimo) ({ anio, mes } = leerMes(ultimo, hoy));
  }
  const desde = diaTexto(anio, mes, 1);
  const fin = diaTexto(anio, mes, diasEnMes(anio, mes));
  const reservas = await reservasEnRango(espacio.id, desde, fin);
  const semanas = calendarioMes({
    anio,
    mes,
    turnos: espacio.turnos,
    reservas: reservas.map((r) => ({ fecha: diaDeFecha(r.fecha), turno: r.turno, estado: r.estado })),
    hoy,
    hasta,
  });
  const anterior = mesVecino(anio, mes, -1);
  const siguiente = mesVecino(anio, mes, 1);
  const elegido = diaPedido && diaPedido.slice(0, 7) === mesTexto(anio, mes)
    ? semanas.flat().find((d) => d?.dia === diaPedido) ?? null
    : null;
  return {
    anio,
    mes,
    semanas,
    hasta,
    elegido,
    reservasDia: elegido ? reservas.filter((r) => diaDeFecha(r.fecha) === elegido.dia) : [],
    mesAnterior: !opciones.soloFuturo || mesTexto(anterior.anio, anterior.mes) >= actual ? mesTexto(anterior.anio, anterior.mes) : null,
    mesSiguiente: !opciones.soloFuturo || mesTexto(siguiente.anio, siguiente.mes) <= ultimo ? mesTexto(siguiente.anio, siguiente.mes) : null,
  };
}

/** Mensaje de la reserva recién hecha o aprobada (?hecha=<id>), solo si es de las unidades o la propiedad indicadas. */
export async function mensajeReservaHecha(
  id: unknown,
  filtro: { unidadIds: string[] } | { condominioId: string },
  moneda: string,
  paraResidente: boolean,
) {
  if (typeof id !== "string") return null;
  const r = await db.reserva.findFirst({
    where: { id, ...("unidadIds" in filtro ? { unidadId: { in: filtro.unidadIds } } : { condominioId: filtro.condominioId }) },
    include: {
      espacio: { select: { nombre: true } },
      unidad: { select: { numero: true } },
      gasto: { include: { periodo: { select: { anio: true, mes: true } } } },
    },
  });
  if (!r || (r.estado !== "PENDIENTE" && r.estado !== "CONFIRMADA")) return null;
  return textoReservaHecha(
    {
      estado: r.estado,
      cobro: r.cobro,
      espacio: r.espacio.nombre,
      fecha: formatoDia(r.fecha),
      turno: r.turno,
      monto: formatoMoneda(r.monto, moneda),
      mesCargo: r.gasto ? nombrePeriodo(r.gasto.periodo.anio, r.gasto.periodo.mes).toLowerCase() : null,
      unidad: paraResidente ? undefined : r.unidad.numero,
    },
    paraResidente,
  );
}
