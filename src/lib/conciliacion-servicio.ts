import "server-only";
// FIN-COMP · Entrega A · Conciliación de ingresos (FIN-003.2) contra la base.
//
// Reglas que no se rompen:
// - Un movimiento de la cartola nunca financia más que su monto (montoConciliado + CHECK en la base).
// - Un pago tiene como máximo UNA conciliación vigente (índice único parcial en la base).
// - Si la administración ya registró el pago a mano, se VINCULA: no se crea un segundo ingreso.
// - Todo cambia en una sola transacción, con la unidad y el movimiento bloqueados (FOR UPDATE):
//   dos personas confirmando a la vez no pueden usar la misma plata dos veces.
// - Nada se borra: deshacer deja la conciliación anulada, con quién, cuándo y por qué.
// - Toda decisión queda en el registro de cambios.

import { db } from "@/lib/db";
import type { UsuarioActual } from "@/lib/auth";
import { registrarEn } from "@/lib/registro";
import { anularConciliacionEn, anularPagoEn, bloquearUnidades, ErrorCobro, registrarPagoEn } from "@/lib/cobro-servicio";
import { aMinimo, decimalesMoneda, deMinimo } from "@/lib/cobro";
import { formatoFecha, formatoMoneda } from "@/lib/formato";
import { estadoSegunConciliado, sugerirParaAbono } from "@/lib/conciliacion";
import { ESTADOS_ABIERTOS, ESTADOS_TRANSFERENCIA } from "@/lib/pagos";
import { sincronizarConstanciaEn } from "@/lib/constancias-servicio";
import { exigirMesAbierto, MesCerrado } from "@/lib/mes-cerrado";

type Autor = Pick<UsuarioActual, "id" | "nombre" | "administradoraId">;
type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

export class ErrorConciliacion extends ErrorCobro {}

async function monedaDe(administradoraId: string) {
  const adm = await db.administradora.findUniqueOrThrow({ where: { id: administradoraId }, select: { moneda: true } });
  return { moneda: adm.moneda, dec: decimalesMoneda(adm.moneda) };
}

const dia = (d: Date) => formatoFecha(d);

/** Bloquea el movimiento y lo devuelve (siempre DESPUÉS de bloquear las unidades). */
export async function bloquearMovimiento(tx: Tx, movimientoId: string, condominioId: string, administradoraId: string) {
  await tx.$queryRaw`SELECT id FROM "MovimientoBancario" WHERE id = ${movimientoId} FOR UPDATE`;
  const m = await tx.movimientoBancario.findFirst({
    where: { id: movimientoId, condominioId, administradoraId },
    include: { cuenta: { select: { banco: true, numeroFinal: true } } },
  });
  if (!m) throw new ErrorConciliacion("Ese movimiento no es de una cuenta de esta comunidad.");
  return m;
}

/**
 * Asigna `montoMin` del movimiento (ya bloqueado) a un pago u otro ingreso. Revisa que quede
 * saldo sin conciliar y actualiza el estado del movimiento. Devuelve la conciliación creada.
 */
export async function conciliarEn(
  tx: Tx,
  m: Awaited<ReturnType<typeof bloquearMovimiento>>,
  dec: number,
  moneda: string,
  datos: {
    montoMin: number;
    tipo: "PAGO" | "OTRO_INGRESO" | "EGRESO" | "OTRO_EGRESO";
    pagoId?: string;
    transferenciaId?: string;
    gastoId?: string;
    concepto?: string;
    autor: Autor;
  },
) {
  // FIN-COMP B: los cargos también se concilian. En la base `montoConciliado` lleva el signo del
  // movimiento (CHECK de FIN-003.1); aquí se trabaja con magnitudes y se guarda con su signo.
  // La conciliación (`monto`) es siempre positiva.
  const conSigno = aMinimo(m.monto.toString(), dec);
  const esIngreso = datos.tipo === "PAGO" || datos.tipo === "OTRO_INGRESO";
  if (esIngreso && conSigno <= 0) throw new ErrorConciliacion("Ese movimiento es un cargo, no un abono.");
  if (!esIngreso && conSigno >= 0) throw new ErrorConciliacion("Ese movimiento es un abono, no un cargo.");
  const total = Math.abs(conSigno);
  try {
    await exigirMesAbierto(tx, m.condominioId, m.fecha, "conciliar un movimiento");
  } catch (e) {
    if (e instanceof MesCerrado) throw new ErrorConciliacion(e.message);
    throw e;
  }
  if (datos.montoMin <= 0) throw new ErrorConciliacion("El monto debe ser mayor que cero.");
  const yaConciliado = Math.abs(aMinimo(m.montoConciliado.toString(), dec));
  const restante = total - yaConciliado;
  if (datos.montoMin > restante) {
    throw new ErrorConciliacion(`El movimiento solo tiene ${formatoMoneda(deMinimo(Math.max(restante, 0), dec), moneda)} sin conciliar.`);
  }
  const c = await tx.conciliacionMovimiento.create({
    data: {
      administradoraId: m.administradoraId,
      condominioId: m.condominioId,
      movimientoId: m.id,
      tipo: datos.tipo,
      monto: deMinimo(datos.montoMin, dec),
      pagoId: datos.pagoId ?? null,
      transferenciaId: datos.transferenciaId ?? null,
      gastoId: datos.gastoId ?? null,
      concepto: datos.concepto ?? null,
      creadoPor: datos.autor.nombre,
    },
  });
  const conciliado = yaConciliado + datos.montoMin;
  const estado = estadoSegunConciliado(total, conciliado);
  await tx.movimientoBancario.update({
    where: { id: m.id },
    data: {
      montoConciliado: deMinimo(Math.sign(conSigno) * conciliado, dec),
      estado,
      nota: estado === "CONCILIADO" ? null : `Conciliado en parte (${formatoMoneda(deMinimo(conciliado, dec), moneda)}). Falta identificar el resto.`,
    },
  });
  return c;
}

/** Si el pago está unido a una transferencia que esperaba la cartola, ahora queda verificada. */
async function completarTransferenciaDelPago(tx: Tx, pagoId: string, movimientoId: string, autor: Autor) {
  const t = await tx.transferenciaInformada.findUnique({ where: { pagoId } });
  if (!t || t.estado === "CONCILIADA") return null;
  await tx.transferenciaInformada.update({
    where: { id: t.id },
    data: { estado: "CONCILIADA", movimientoId, revisadoPor: autor.nombre, revisadoEn: new Date() },
  });
  await sincronizarConstanciaEn(tx, t.id, autor.nombre);
  await registrarEn(tx, {
    autor,
    accion: "Verificó una transferencia con la cartola",
    detalle: "Su pago ya estaba registrado; ahora también tiene el movimiento bancario.",
    condominioId: t.condominioId,
    entidad: "TransferenciaInformada",
    entidadId: t.id,
    antes: { estado: t.estado },
    despues: { estado: "CONCILIADA", movimientoId },
  });
  return t.id;
}

// ---------------------------------------------------------------------------
// Registrar un pago nuevo desde un abono de la cartola (con o sin transferencia informada)

export type DatosIngreso = {
  condominioId: string;
  movimientoId: string;
  unidadId: string;
  monto: number;
  distribucion?: { avisoId: string; monto: number }[];
  transferenciaId?: string;
  permitirDuplicado?: boolean;
};

/**
 * Crea UN pago de la unidad respaldado por el movimiento: el pago (Recaudación), la conciliación y,
 * si viene de una transferencia informada, su verificación. Todo o nada.
 */
export async function registrarIngresoDesdeMovimiento(autor: Autor, datos: DatosIngreso) {
  const administradoraId = autor.administradoraId!;
  const { moneda, dec } = await monedaDe(administradoraId);
  return db.$transaction(async (tx) => {
    const unidad = await tx.unidad.findFirst({ where: { id: datos.unidadId, condominioId: datos.condominioId, administradoraId }, select: { id: true, numero: true } });
    if (!unidad) throw new ErrorConciliacion("Unidad no encontrada en esta comunidad.");
    await bloquearUnidades(tx, [unidad.id]);
    let t: Awaited<ReturnType<typeof tx.transferenciaInformada.findUniqueOrThrow>> | null = null;
    if (datos.transferenciaId) {
      await tx.$queryRaw`SELECT id FROM "TransferenciaInformada" WHERE id = ${datos.transferenciaId} FOR UPDATE`;
      t = await tx.transferenciaInformada.findFirst({ where: { id: datos.transferenciaId, condominioId: datos.condominioId, administradoraId } });
      if (!t) throw new ErrorConciliacion("La transferencia no existe.");
      if (t.unidadId !== unidad.id) throw new ErrorConciliacion("La transferencia es de otra unidad.");
      if (!ESTADOS_ABIERTOS.includes(t.estado)) throw new ErrorConciliacion(`La transferencia ya está «${ESTADOS_TRANSFERENCIA[t.estado].texto}».`);
      if (t.pagoId) throw new ErrorConciliacion("Esta transferencia ya está unida a un pago registrado. Concilia ese pago con la cartola.");
    }
    const m = await bloquearMovimiento(tx, datos.movimientoId, datos.condominioId, administradoraId);
    const montoMin = aMinimo(datos.monto, dec);
    if (Number(m.monto) <= 0) throw new ErrorConciliacion("Ese movimiento es un cargo, no un abono.");
    // Revisar el saldo del movimiento antes de crear el pago (conciliarEn lo vuelve a revisar).
    const restante = aMinimo(m.monto.toString(), dec) - aMinimo(m.montoConciliado.toString(), dec);
    if (montoMin > restante) throw new ErrorConciliacion(`El movimiento solo tiene ${formatoMoneda(deMinimo(Math.max(restante, 0), dec), moneda)} sin conciliar.`);
    const monto = deMinimo(montoMin, dec);
    const referencia = [t ? "Transferencia informada" : "Abono de cartola", t?.operacion && `op. ${t.operacion}`, `cartola ${m.cuenta.banco} ···${m.cuenta.numeroFinal}`]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 120);
    const pago = await registrarPagoEn(
      tx,
      administradoraId,
      { unidadId: unidad.id, monto, fecha: m.fecha, medio: "TRANSFERENCIA", referencia },
      { permitirDuplicado: datos.permitirDuplicado, distribucion: datos.distribucion },
    );
    const c = await conciliarEn(tx, m, dec, moneda, { montoMin, tipo: "PAGO", pagoId: pago.id, transferenciaId: t?.id, autor });
    if (t) {
      const diferencia = aMinimo(t.monto.toString(), dec) !== montoMin;
      await tx.transferenciaInformada.update({
        where: { id: t.id },
        data: {
          estado: "CONCILIADA",
          movimientoId: m.id,
          pagoId: pago.id,
          revisadoPor: autor.nombre,
          revisadoEn: new Date(),
          nota: diferencia ? `Se registró ${formatoMoneda(monto, moneda)} (el residente informó ${formatoMoneda(Number(t.monto), moneda)}).` : t.nota,
        },
      });
      await sincronizarConstanciaEn(tx, t.id, autor.nombre);
      await registrarEn(tx, {
        autor,
        accion: "Verificó y concilió una transferencia",
        detalle: `Unidad ${unidad.numero}: pago de ${formatoMoneda(monto, moneda)} con el movimiento del ${dia(m.fecha)} (${m.cuenta.banco} ···${m.cuenta.numeroFinal}).`,
        condominioId: datos.condominioId,
        entidad: "TransferenciaInformada",
        entidadId: t.id,
        antes: { estado: t.estado },
        despues: { estado: "CONCILIADA", pagoId: pago.id, movimientoId: m.id, monto, conciliacionId: c.id },
      });
    }
    await registrarEn(tx, {
      autor,
      accion: "Registró un pago conciliado con la cartola",
      detalle: `Unidad ${unidad.numero}: ${formatoMoneda(monto, moneda)} del ${dia(m.fecha)} (${m.cuenta.banco} ···${m.cuenta.numeroFinal})${datos.distribucion ? ", con distribución elegida" : ""}.`,
      condominioId: datos.condominioId,
      entidad: "Pago",
      entidadId: pago.id,
      despues: { monto, movimientoId: m.id, conciliacionId: c.id, transferenciaId: t?.id ?? null, distribucion: datos.distribucion ?? null },
    });
    return { pagoId: pago.id, conciliacionId: c.id };
  });
}

// ---------------------------------------------------------------------------
// Vincular un pago que la administración ya registró a mano

/** Une un pago ya registrado con el movimiento de la cartola. No crea otro ingreso. */
export async function vincularPagoConMovimiento(autor: Autor, datos: { condominioId: string; movimientoId: string; pagoId: string }) {
  const administradoraId = autor.administradoraId!;
  const { moneda, dec } = await monedaDe(administradoraId);
  return db.$transaction(async (tx) => {
    const previo = await tx.pago.findFirst({
      where: { id: datos.pagoId, administradoraId, unidad: { condominioId: datos.condominioId } },
      select: { unidadId: true },
    });
    if (!previo) throw new ErrorConciliacion("Pago no encontrado.");
    await bloquearUnidades(tx, [previo.unidadId]);
    const pago = await tx.pago.findUniqueOrThrow({ where: { id: datos.pagoId }, include: { unidad: { select: { numero: true } } } });
    if (pago.anuladoEn) throw new ErrorConciliacion("Ese pago está anulado.");
    const ya = await tx.conciliacionMovimiento.findFirst({ where: { pagoId: pago.id, anuladaEn: null } });
    if (ya) throw new ErrorConciliacion("Ese pago ya tiene un movimiento bancario asociado.");
    const m = await bloquearMovimiento(tx, datos.movimientoId, datos.condominioId, administradoraId);
    const montoMin = aMinimo(pago.monto.toString(), dec);
    const c = await conciliarEn(tx, m, dec, moneda, { montoMin, tipo: "PAGO", pagoId: pago.id, autor });
    const transferenciaId = await completarTransferenciaDelPago(tx, pago.id, m.id, autor);
    if (transferenciaId) await tx.conciliacionMovimiento.update({ where: { id: c.id }, data: { transferenciaId } });
    await registrarEn(tx, {
      autor,
      accion: "Vinculó un pago registrado con la cartola",
      detalle: `Unidad ${pago.unidad.numero}: el pago de ${formatoMoneda(pago.monto, moneda)} del ${dia(pago.fecha)} corresponde al movimiento del ${dia(m.fecha)} (${m.cuenta.banco} ···${m.cuenta.numeroFinal}). No se creó otro ingreso.`,
      condominioId: datos.condominioId,
      entidad: "Pago",
      entidadId: pago.id,
      despues: { movimientoId: m.id, conciliacionId: c.id },
    });
    return { conciliacionId: c.id };
  });
}

/**
 * La transferencia informada corresponde a un pago que la administración ya registró a mano.
 * Se unen sin crear otro ingreso. Si ese pago ya tiene su movimiento de cartola, la transferencia
 * queda verificada; si no, queda «En revisión» hasta que el pago se concilie con la cartola.
 */
export async function vincularTransferenciaConPago(autor: Autor, datos: { condominioId: string; transferenciaId: string; pagoId: string }) {
  const administradoraId = autor.administradoraId!;
  const { moneda } = await monedaDe(administradoraId);
  return db.$transaction(async (tx) => {
    const previa = await tx.transferenciaInformada.findFirst({ where: { id: datos.transferenciaId, condominioId: datos.condominioId, administradoraId }, select: { unidadId: true } });
    if (!previa) throw new ErrorConciliacion("La transferencia no existe.");
    await bloquearUnidades(tx, [previa.unidadId]);
    await tx.$queryRaw`SELECT id FROM "TransferenciaInformada" WHERE id = ${datos.transferenciaId} FOR UPDATE`;
    const t = await tx.transferenciaInformada.findUniqueOrThrow({ where: { id: datos.transferenciaId }, include: { unidad: { select: { numero: true } } } });
    if (!ESTADOS_ABIERTOS.includes(t.estado)) throw new ErrorConciliacion(`La transferencia ya está «${ESTADOS_TRANSFERENCIA[t.estado].texto}».`);
    if (t.pagoId) throw new ErrorConciliacion("La transferencia ya está unida a un pago.");
    const pago = await tx.pago.findFirst({
      where: { id: datos.pagoId, unidadId: t.unidadId, administradoraId },
      include: { transferencia: { select: { id: true } }, conciliaciones: { where: { anuladaEn: null }, select: { id: true, movimientoId: true } } },
    });
    if (!pago) throw new ErrorConciliacion("Ese pago no es de la misma unidad.");
    if (pago.anuladoEn) throw new ErrorConciliacion("Ese pago está anulado.");
    if (pago.transferencia) throw new ErrorConciliacion("Ese pago ya está unido a otra transferencia informada.");
    const conciliacion = pago.conciliaciones[0];
    const estado = conciliacion ? "CONCILIADA" : "EN_REVISION";
    const nota = conciliacion
      ? `Corresponde al pago registrado el ${dia(pago.fecha)} por ${formatoMoneda(pago.monto, moneda)}, ya conciliado con la cartola.`
      : `Corresponde al pago registrado a mano el ${dia(pago.fecha)} por ${formatoMoneda(pago.monto, moneda)}. Falta encontrarlo en la cartola.`;
    await tx.transferenciaInformada.update({
      where: { id: t.id },
      data: { estado, pagoId: pago.id, movimientoId: conciliacion?.movimientoId ?? null, nota, revisadoPor: autor.nombre, revisadoEn: new Date() },
    });
    await sincronizarConstanciaEn(tx, t.id, autor.nombre);
    if (conciliacion) await tx.conciliacionMovimiento.update({ where: { id: conciliacion.id }, data: { transferenciaId: t.id } });
    await registrarEn(tx, {
      autor,
      accion: "Unió una transferencia informada con un pago ya registrado",
      detalle: `Unidad ${t.unidad.numero}: ${nota} No se creó otro ingreso.`,
      condominioId: datos.condominioId,
      entidad: "TransferenciaInformada",
      entidadId: t.id,
      antes: { estado: t.estado },
      despues: { estado, pagoId: pago.id },
    });
    return { estado };
  });
}

// ---------------------------------------------------------------------------
// Otros ingresos de la comunidad

/** Ingreso que no es pago de una unidad (arriendo de antena, intereses, devolución...). */
export async function registrarOtroIngreso(autor: Autor, datos: { condominioId: string; movimientoId: string; monto: number; concepto: string }) {
  const administradoraId = autor.administradoraId!;
  const { moneda, dec } = await monedaDe(administradoraId);
  const concepto = datos.concepto.trim().slice(0, 200);
  if (concepto.length < 3) throw new ErrorConciliacion("Indica el concepto del ingreso.");
  return db.$transaction(async (tx) => {
    const m = await bloquearMovimiento(tx, datos.movimientoId, datos.condominioId, administradoraId);
    const c = await conciliarEn(tx, m, dec, moneda, { montoMin: aMinimo(datos.monto, dec), tipo: "OTRO_INGRESO", concepto, autor });
    await registrarEn(tx, {
      autor,
      accion: "Registró otro ingreso de la comunidad",
      detalle: `${concepto}: ${formatoMoneda(datos.monto, moneda)} del movimiento del ${dia(m.fecha)} (${m.cuenta.banco} ···${m.cuenta.numeroFinal}).`,
      condominioId: datos.condominioId,
      entidad: "ConciliacionMovimiento",
      entidadId: c.id,
      despues: { tipo: "OTRO_INGRESO", concepto, monto: String(datos.monto), movimientoId: m.id },
    });
    return c;
  });
}

// ---------------------------------------------------------------------------
// Deshacer y reversar (auditado)

/**
 * Deshace una conciliación hecha por error (se eligió el movimiento equivocado). El pago NO se
 * anula: sigue registrado, pero queda «sin movimiento bancario» hasta conciliarlo bien.
 * Si el pago vino de una transferencia informada, esa transferencia vuelve a «En revisión».
 */
export async function deshacerConciliacion(autor: Autor, datos: { condominioId: string; conciliacionId: string; motivo: string }) {
  const administradoraId = autor.administradoraId!;
  return db.$transaction(async (tx) => {
    const c = await tx.conciliacionMovimiento.findFirst({
      where: { id: datos.conciliacionId, condominioId: datos.condominioId, administradoraId },
      include: { pago: { select: { unidadId: true } } },
    });
    if (!c) throw new ErrorConciliacion("Conciliación no encontrada.");
    if (c.pago) await bloquearUnidades(tx, [c.pago.unidadId]);
    const anulada = await anularConciliacionEn(tx, c.id, { por: autor.nombre, motivo: datos.motivo });
    if (anulada.pagoId) {
      const t = await tx.transferenciaInformada.findUnique({ where: { pagoId: anulada.pagoId } });
      if (t && t.estado === "CONCILIADA") {
        await tx.transferenciaInformada.update({
          where: { id: t.id },
          data: { estado: "EN_REVISION", movimientoId: null, nota: `Se deshizo su conciliación con la cartola: ${datos.motivo}`.slice(0, 500), revisadoPor: autor.nombre, revisadoEn: new Date() },
        });
        await sincronizarConstanciaEn(tx, t.id, autor.nombre);
        await registrarEn(tx, {
          autor,
          accion: "Volvió a revisión al deshacer la conciliación",
          detalle: datos.motivo,
          condominioId: datos.condominioId,
          entidad: "TransferenciaInformada",
          entidadId: t.id,
          antes: { estado: "CONCILIADA", movimientoId: t.movimientoId },
          despues: { estado: "EN_REVISION" },
        });
      }
    }
    await registrarEn(tx, {
      autor,
      accion: "Deshizo una conciliación bancaria",
      detalle: `${
        c.tipo === "PAGO" ? "Pago" : c.tipo === "EGRESO" ? "Egreso" : c.tipo === "OTRO_EGRESO" ? `Otro egreso (${c.concepto})` : `Otro ingreso (${c.concepto})`
      } por ${Number(c.monto).toLocaleString("es-CL")}. ${c.tipo === "EGRESO" ? "El egreso sigue pagado" : c.tipo === "PAGO" ? "El pago no se anuló" : "Queda por identificar"}. Motivo: ${datos.motivo}`,
      condominioId: datos.condominioId,
      entidad: "ConciliacionMovimiento",
      entidadId: c.id,
      antes: { vigente: true, movimientoId: c.movimientoId, pagoId: c.pagoId },
      despues: { vigente: false, motivo: datos.motivo },
    });
  });
}

/**
 * Reversa el pago de una transferencia verificada (por ejemplo, el banco devolvió la plata).
 * El pago queda anulado (no se borra), la deuda vuelve a los avisos, el movimiento queda libre y
 * la transferencia pasa a «Anulado o reversado», con su motivo a la vista del residente.
 */
export async function reversarTransferencia(autor: Autor, datos: { condominioId: string; transferenciaId: string; motivo: string }) {
  const administradoraId = autor.administradoraId!;
  const { moneda } = await monedaDe(administradoraId);
  return db.$transaction(async (tx) => {
    const t = await tx.transferenciaInformada.findFirst({
      where: { id: datos.transferenciaId, condominioId: datos.condominioId, administradoraId },
      include: { pago: true, unidad: { select: { numero: true } } },
    });
    if (!t) throw new ErrorConciliacion("La transferencia no existe.");
    if (!t.pago || t.estado !== "CONCILIADA") throw new ErrorConciliacion("Solo se puede reversar una transferencia verificada y conciliada.");
    await anularPagoEn(tx, t.pago.id, administradoraId, { por: autor.nombre, motivo: datos.motivo, transferencia: "ANULADA" }, ({ devuelto }) => ({
      autor,
      accion: "Reversó un pago",
      detalle: `Unidad ${t.unidad.numero}: ${formatoMoneda(t.pago!.monto, moneda)} del ${dia(t.pago!.fecha)} (transferencia informada). Motivo: ${datos.motivo}`,
      condominioId: datos.condominioId,
      entidad: "Pago",
      entidadId: t.pago!.id,
      antes: { estado: "Vigente", monto: t.pago!.monto.toString() },
      despues: { estado: "Reversado", motivo: datos.motivo, devueltoALaDeuda: devuelto },
    }));
  });
}

// ---------------------------------------------------------------------------
// Sugerencias

/** Qué podría ser un abono de la cartola: transferencias informadas, pagos sin cartola y unidades. */
export async function sugerenciasDeMovimiento(m: { id: string; condominioId: string; administradoraId: string; fecha: Date; monto: { toString(): string }; montoConciliado: { toString(): string }; descripcion: string | null; referencia: string | null; contraparte: string | null; rutContraparte: string | null }) {
  const dec = (await monedaDe(m.administradoraId)).dec;
  const desde = new Date(m.fecha.getTime() - 10 * 86_400_000);
  const hasta = new Date(m.fecha.getTime() + 10 * 86_400_000);
  const [transferencias, pagos, unidades] = await Promise.all([
    db.transferenciaInformada.findMany({
      where: { condominioId: m.condominioId, administradoraId: m.administradoraId, estado: { in: ["INFORMADA", "EN_REVISION"] }, pagoId: null, fecha: { gte: desde, lte: hasta } },
      include: { unidad: { select: { numero: true } } },
      take: 200,
    }),
    db.pago.findMany({
      where: { administradoraId: m.administradoraId, unidad: { condominioId: m.condominioId }, anuladoEn: null, conciliaciones: { none: { anuladaEn: null } }, fecha: { gte: desde, lte: hasta } },
      include: { unidad: { select: { numero: true } } },
      take: 200,
    }),
    db.unidad.findMany({
      where: { condominioId: m.condominioId, administradoraId: m.administradoraId },
      select: {
        id: true,
        numero: true,
        avisos: { where: { saldo: { gt: 0 } }, select: { saldo: true } },
        personas: { select: { persona: { select: { documento: true, nombre: true } } } },
      },
    }),
  ]);
  const min = (v: { toString(): string }) => aMinimo(v.toString(), dec);
  const r = sugerirParaAbono(
    {
      fecha: m.fecha,
      restante: min(m.monto) - min(m.montoConciliado),
      descripcion: m.descripcion,
      referencia: m.referencia,
      contraparte: m.contraparte,
      rutContraparte: m.rutContraparte,
    },
    {
      transferencias: transferencias.map((t) => ({ id: t.id, unidadId: t.unidadId, unidad: t.unidad.numero, fecha: t.fecha, monto: min(t.monto), operacion: t.operacion, pagadoPor: t.pagadoPor })),
      pagos: pagos.map((p) => ({ id: p.id, unidadId: p.unidadId, unidad: p.unidad.numero, fecha: p.fecha, monto: min(p.monto), referencia: p.referencia })),
      unidades: unidades.map((u) => {
        const saldos = u.avisos.map((a) => min(a.saldo));
        return {
          id: u.id,
          numero: u.numero,
          deuda: saldos.reduce((s, x) => s + x, 0),
          saldosAvisos: saldos,
          ruts: u.personas.map((p) => p.persona.documento).filter((x): x is string => !!x),
          nombres: u.personas.map((p) => p.persona.nombre),
        };
      }),
    },
  );
  return {
    ambigua: r.ambigua,
    sugerencias: r.sugerencias.map((s) => ({ ...s, monto: deMinimo(s.monto, dec), fuerte: s.puntos >= 70 })),
  };
}
