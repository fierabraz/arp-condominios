import "server-only";
// FIN-COMP · Entrega B · Egresos (pago a proveedores, respaldos), conciliación de los cargos de la
// cartola y fondos de la comunidad.
//
// Reglas:
// - Un gasto común es lo que se reparte; el EGRESO es su pago al proveedor (fecha, medio, respaldo).
// - Un cargo de la cartola se concilia con uno o varios egresos, o como «otro egreso» (comisión,
//   impuesto). Un egreso tiene como máximo una conciliación vigente (lo impide la base).
// - Lo que se paga con un fondo no se prorratea: sale del saldo del fondo.
// - Todo queda en el registro de cambios y en una sola transacción.

import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import type { UsuarioActual } from "@/lib/auth";
import type { MedioPago } from "@/generated/prisma/enums";
import { registrarEn } from "@/lib/registro";
import { aMinimo, decimalesMoneda } from "@/lib/cobro";
import { formatoFecha, formatoMoneda } from "@/lib/formato";
import { COMPROBANTE_TAMANO_MAXIMO, tipoComprobante } from "@/lib/pagos";
import { bloquearMovimiento, conciliarEn, ErrorConciliacion } from "@/lib/conciliacion-servicio";
import { exigirMesAbierto, MesCerrado } from "@/lib/mes-cerrado";

async function enEgreso<T>(p: Promise<T>) {
  try {
    return await p;
  } catch (e) {
    if (e instanceof MesCerrado) throw new ErrorEgreso(e.message);
    throw e;
  }
}

type Autor = Pick<UsuarioActual, "id" | "nombre" | "administradoraId">;
type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

export class ErrorEgreso extends Error {}

async function monedaDe(administradoraId: string) {
  const adm = await db.administradora.findUniqueOrThrow({ where: { id: administradoraId }, select: { moneda: true } });
  return { moneda: adm.moneda, dec: decimalesMoneda(adm.moneda) };
}

async function gastoDe(tx: Tx, gastoId: string, condominioId: string, administradoraId: string) {
  await tx.$queryRaw`SELECT id FROM "Gasto" WHERE id = ${gastoId} FOR UPDATE`;
  const g = await tx.gasto.findFirst({
    where: { id: gastoId, administradoraId, periodo: { condominioId } },
    include: { periodo: { select: { anio: true, mes: true } }, conciliaciones: { where: { anuladaEn: null }, select: { id: true } } },
  });
  if (!g) throw new ErrorEgreso("Egreso no encontrado.");
  return g;
}

// ---------------------------------------------------------------------------
// Pago al proveedor

export async function registrarPagoEgreso(
  autor: Autor,
  datos: { condominioId: string; gastoId: string; fechaPago: Date; medioPago: MedioPago },
) {
  const administradoraId = autor.administradoraId!;
  return db.$transaction(async (tx) => {
    const g = await gastoDe(tx, datos.gastoId, datos.condominioId, administradoraId);
    if (g.estadoPago === "PAGADO") throw new ErrorEgreso("Ese egreso ya está pagado.");
    await enEgreso(exigirMesAbierto(tx, datos.condominioId, datos.fechaPago, "registrar un pago a proveedor"));
    await tx.gasto.update({
      where: { id: g.id },
      data: { estadoPago: "PAGADO", fechaPago: datos.fechaPago, medioPago: datos.medioPago, pagadoPor: autor.nombre },
    });
    await registrarEn(tx, {
      autor,
      accion: "Registró el pago de un egreso",
      detalle: `${g.descripcion}${g.proveedor ? ` (${g.proveedor})` : ""}: pagado el ${formatoFecha(datos.fechaPago)}.`,
      condominioId: datos.condominioId,
      entidad: "Gasto",
      entidadId: g.id,
      antes: { estadoPago: g.estadoPago },
      despues: { estadoPago: "PAGADO", fechaPago: datos.fechaPago.toISOString().slice(0, 10), medioPago: datos.medioPago },
    });
  });
}

/** Deshace un pago registrado por error. No se puede si el pago ya está conciliado con la cartola. */
export async function anularPagoEgreso(autor: Autor, datos: { condominioId: string; gastoId: string; motivo: string }) {
  const administradoraId = autor.administradoraId!;
  return db.$transaction(async (tx) => {
    const g = await gastoDe(tx, datos.gastoId, datos.condominioId, administradoraId);
    if (g.estadoPago !== "PAGADO") throw new ErrorEgreso("Ese egreso no está pagado.");
    if (g.conciliaciones.length) throw new ErrorEgreso("Está conciliado con un cargo de la cartola. Deshaz primero esa conciliación.");
    if (g.fechaPago) await enEgreso(exigirMesAbierto(tx, datos.condominioId, g.fechaPago, "anular un pago a proveedor"));
    await tx.gasto.update({ where: { id: g.id }, data: { estadoPago: "POR_PAGAR", fechaPago: null, medioPago: null, pagadoPor: null } });
    await registrarEn(tx, {
      autor,
      accion: "Anuló el pago de un egreso",
      detalle: `${g.descripcion}: ${datos.motivo}`,
      condominioId: datos.condominioId,
      entidad: "Gasto",
      entidadId: g.id,
      antes: { estadoPago: "PAGADO", fechaPago: g.fechaPago?.toISOString().slice(0, 10) },
      despues: { estadoPago: "POR_PAGAR" },
    });
  });
}

// ---------------------------------------------------------------------------
// Respaldos

export async function subirRespaldo(autor: Autor, datos: { condominioId: string; gastoId: string; nombre: string; archivo: Buffer }) {
  const administradoraId = autor.administradoraId!;
  if (datos.archivo.length === 0) throw new ErrorEgreso("Elige un archivo.");
  if (datos.archivo.length > COMPROBANTE_TAMANO_MAXIMO) throw new ErrorEgreso("El archivo pesa más de 900 KB. Sube una versión más liviana.");
  const tipo = tipoComprobante(new Uint8Array(datos.archivo));
  if (!tipo) throw new ErrorEgreso("El respaldo debe ser un PDF o una imagen (JPG, PNG o WEBP).");
  const huella = createHash("sha256").update(datos.archivo).digest("hex");
  const nombre = (datos.nombre || "respaldo").replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 120);
  return db.$transaction(async (tx) => {
    const g = await gastoDe(tx, datos.gastoId, datos.condominioId, administradoraId);
    if (await tx.respaldoGasto.findFirst({ where: { gastoId: g.id, huella }, select: { id: true } })) {
      throw new ErrorEgreso("Ese mismo archivo ya está adjunto a este egreso.");
    }
    const r = await tx.respaldoGasto.create({
      data: { gastoId: g.id, nombre, tipo, tamano: datos.archivo.length, huella, datos: new Uint8Array(datos.archivo), subidoPor: autor.nombre },
    });
    await registrarEn(tx, {
      autor,
      accion: "Adjuntó un respaldo a un egreso",
      detalle: `${g.descripcion}: ${nombre}`,
      condominioId: datos.condominioId,
      entidad: "Gasto",
      entidadId: g.id,
    });
    return r;
  });
}

// ---------------------------------------------------------------------------
// Conciliación de cargos

/** Concilia un cargo con un egreso. Si el egreso estaba por pagar, queda pagado en la fecha del cargo. */
export async function conciliarCargoConEgreso(autor: Autor, datos: { condominioId: string; movimientoId: string; gastoId: string }) {
  const administradoraId = autor.administradoraId!;
  const { moneda, dec } = await monedaDe(administradoraId);
  try {
    return await db.$transaction(async (tx) => {
      // Orden de bloqueo fijo: primero el egreso, después el movimiento.
      const g = await gastoDe(tx, datos.gastoId, datos.condominioId, administradoraId);
      if (g.tipo !== "COMUN") throw new ErrorEgreso("Solo los gastos comunes son egresos de la comunidad.");
      if (g.conciliaciones.length) throw new ErrorEgreso("Ese egreso ya está conciliado con otro cargo.");
      const m = await bloquearMovimiento(tx, datos.movimientoId, datos.condominioId, administradoraId);
      const c = await conciliarEn(tx, m, dec, moneda, { montoMin: aMinimo(g.monto.toString(), dec), tipo: "EGRESO", gastoId: g.id, autor });
      if (g.estadoPago !== "PAGADO") {
        await tx.gasto.update({ where: { id: g.id }, data: { estadoPago: "PAGADO", fechaPago: m.fecha, medioPago: "TRANSFERENCIA", pagadoPor: autor.nombre } });
      }
      await registrarEn(tx, {
        autor,
        accion: "Concilió un cargo con un egreso",
        detalle: `${g.descripcion}${g.proveedor ? ` (${g.proveedor})` : ""} por ${formatoMoneda(g.monto, moneda)}, con el cargo del ${formatoFecha(m.fecha)} (${m.cuenta.banco} ···${m.cuenta.numeroFinal}).`,
        condominioId: datos.condominioId,
        entidad: "ConciliacionMovimiento",
        entidadId: c.id,
        despues: { tipo: "EGRESO", gastoId: g.id, movimientoId: m.id, monto: g.monto.toString() },
      });
      return c;
    });
  } catch (e) {
    if (e instanceof ErrorConciliacion) throw new ErrorEgreso(e.message);
    throw e;
  }
}

export async function registrarOtroEgreso(autor: Autor, datos: { condominioId: string; movimientoId: string; monto: number; concepto: string }) {
  const administradoraId = autor.administradoraId!;
  const { moneda, dec } = await monedaDe(administradoraId);
  const concepto = datos.concepto.trim().slice(0, 200);
  if (concepto.length < 3) throw new ErrorEgreso("Indica el concepto del cargo.");
  try {
    return await db.$transaction(async (tx) => {
      const m = await bloquearMovimiento(tx, datos.movimientoId, datos.condominioId, administradoraId);
      const c = await conciliarEn(tx, m, dec, moneda, { montoMin: aMinimo(datos.monto, dec), tipo: "OTRO_EGRESO", concepto, autor });
      await registrarEn(tx, {
        autor,
        accion: "Registró otro egreso de la comunidad",
        detalle: `${concepto}: ${formatoMoneda(datos.monto, moneda)} del cargo del ${formatoFecha(m.fecha)}.`,
        condominioId: datos.condominioId,
        entidad: "ConciliacionMovimiento",
        entidadId: c.id,
        despues: { tipo: "OTRO_EGRESO", concepto, monto: String(datos.monto), movimientoId: m.id },
      });
      return c;
    });
  } catch (e) {
    if (e instanceof ErrorConciliacion) throw new ErrorEgreso(e.message);
    throw e;
  }
}

const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

/** Egresos que podrían corresponder a un cargo: mismo monto, fechas cercanas, proveedor en la glosa. */
export async function sugerenciasDeCargo(m: { condominioId: string; administradoraId: string; fecha: Date; monto: { toString(): string }; montoConciliado: { toString(): string }; descripcion: string | null }) {
  const restante = Math.round((Math.abs(Number(m.monto.toString())) - Math.abs(Number(m.montoConciliado.toString()))) * 100) / 100;
  if (restante <= 0) return [];
  const gastos = await db.gasto.findMany({
    where: { administradoraId: m.administradoraId, tipo: "COMUN", periodo: { condominioId: m.condominioId }, monto: { lte: restante }, conciliaciones: { none: { anuladaEn: null } } },
    include: { periodo: { select: { anio: true, mes: true } } },
    orderBy: { fecha: "desc" },
    take: 300,
  });
  const glosa = normalizar(m.descripcion ?? "");
  const dias = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) / 86_400_000;
  return gastos
    .map((g) => {
      let puntos = 0;
      const motivos: string[] = [];
      if (Number(g.monto) === restante) {
        puntos += 50;
        motivos.push("mismo monto");
      }
      const referencia = g.fechaPago ?? g.fecha;
      if (dias(referencia, m.fecha) <= 7) {
        puntos += 20;
        motivos.push(g.fechaPago ? "pagado esos días" : "fecha cercana");
      } else if (dias(referencia, m.fecha) <= 45) puntos += 5;
      const palabras = normalizar(g.proveedor ?? "").split(/[^A-Z0-9]+/).filter((p) => p.length >= 4 && !["LTDA", "SPA"].includes(p));
      if (palabras.some((p) => glosa.includes(p))) {
        puntos += 30;
        motivos.push("proveedor en la glosa");
      }
      return { gasto: g, puntos, motivos };
    })
    .filter((s) => s.puntos >= 50)
    .sort((a, b) => b.puntos - a.puntos)
    .slice(0, 5);
}

// ---------------------------------------------------------------------------
// Fondos

/** El fondo de reserva existe siempre (se crea la primera vez que se necesita). */
export async function asegurarFondoReserva(condominioId: string, administradoraId: string) {
  const existe = await db.fondo.findFirst({ where: { condominioId, tipo: "RESERVA" } });
  if (existe) return existe;
  return db.fondo.upsert({
    where: { condominioId_nombre: { condominioId, nombre: "Fondo de reserva" } },
    update: {},
    create: { administradoraId, condominioId, nombre: "Fondo de reserva", tipo: "RESERVA", creadoPor: "Convive" },
  });
}

/** Saldo de cada fondo de la comunidad, con su detalle. Misma fuente para pantallas e informes. */
/** Períodos hasta el mes de la fecha (incluido): el aporte de reserva de un mes cuenta en ese mes aunque se emita después. */
const hastaMes = (d: Date) => ({ OR: [{ anio: { lt: d.getUTCFullYear() } }, { anio: d.getUTCFullYear(), mes: { lte: d.getUTCMonth() + 1 } }] });

export async function saldosFondos(condominioId: string, administradoraId: string, hasta?: Date) {
  await asegurarFondoReserva(condominioId, administradoraId);
  const fondos = await db.fondo.findMany({ where: { condominioId, administradoraId }, orderBy: [{ tipo: "asc" }, { nombre: "asc" }] });
  const [aporteReserva, recaudadoReserva] = await Promise.all([
    db.avisoCobro.aggregate({ where: { unidad: { condominioId }, ...(hasta ? { periodo: hastaMes(hasta) } : {}) }, _sum: { fondoReserva: true } }),
    // Lo efectivamente recaudado del fondo: proporción pagada de cada aviso.
    db.avisoCobro.findMany({ where: { unidad: { condominioId } }, select: { fondoReserva: true, total: true, saldo: true } }),
  ]);
  const recaudado = recaudadoReserva.reduce((s, a) => (Number(a.total) > 0 ? s + (Number(a.fondoReserva) * (Number(a.total) - Number(a.saldo))) / Number(a.total) : s), 0);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return Promise.all(
    fondos.map(async (f) => {
      const [movs, gastos] = await Promise.all([
        db.movimientoFondo.groupBy({ by: ["tipo"], where: { fondoId: f.id, anuladoEn: null, ...(hasta ? { fecha: { lte: hasta } } : {}) }, _sum: { monto: true } }),
        db.gasto.aggregate({ where: { fondoId: f.id, ...(hasta ? { fecha: { lte: hasta } } : {}) }, _sum: { monto: true } }),
      ]);
      const manual = (t: "APORTE" | "RETIRO") => Number(movs.find((x) => x.tipo === t)?._sum.monto ?? 0);
      const aportesAvisos = f.tipo === "RESERVA" ? Number(aporteReserva._sum.fondoReserva ?? 0) : 0;
      const egresos = Number(gastos._sum.monto ?? 0);
      const saldo = Number(f.saldoInicial) + aportesAvisos + manual("APORTE") - manual("RETIRO") - egresos;
      return {
        fondo: f,
        saldoInicial: Number(f.saldoInicial),
        aportesAvisos: r2(aportesAvisos),
        recaudadoAvisos: f.tipo === "RESERVA" ? r2(recaudado) : 0,
        aportesManuales: r2(manual("APORTE")),
        retirosManuales: r2(manual("RETIRO")),
        egresos: r2(egresos),
        saldo: r2(saldo),
      };
    }),
  );
}

export async function crearFondo(autor: Autor, datos: { condominioId: string; nombre: string; saldoInicial: number }) {
  const administradoraId = autor.administradoraId!;
  const nombre = datos.nombre.trim().slice(0, 80);
  if (nombre.length < 3) throw new ErrorEgreso("Ponle un nombre al fondo.");
  if (!(datos.saldoInicial >= 0)) throw new ErrorEgreso("El saldo inicial no puede ser negativo.");
  return db.$transaction(async (tx) => {
    if (await tx.fondo.findFirst({ where: { condominioId: datos.condominioId, nombre: { equals: nombre, mode: "insensitive" } } })) {
      throw new ErrorEgreso("Ya existe un fondo con ese nombre.");
    }
    const f = await tx.fondo.create({ data: { administradoraId, condominioId: datos.condominioId, nombre, tipo: "OTRO", saldoInicial: datos.saldoInicial, creadoPor: autor.nombre } });
    await registrarEn(tx, { autor, accion: "Creó un fondo", detalle: `${nombre} con saldo inicial ${datos.saldoInicial}.`, condominioId: datos.condominioId, entidad: "Fondo", entidadId: f.id });
    return f;
  });
}

export async function registrarMovimientoFondo(
  autor: Autor,
  datos: { condominioId: string; fondoId: string; tipo: "APORTE" | "RETIRO"; fecha: Date; monto: number; descripcion: string },
) {
  const administradoraId = autor.administradoraId!;
  const descripcion = datos.descripcion.trim().slice(0, 200);
  if (descripcion.length < 3) throw new ErrorEgreso("Describe el movimiento.");
  if (!(datos.monto > 0)) throw new ErrorEgreso("El monto debe ser mayor que cero.");
  const fondo = await db.fondo.findFirst({ where: { id: datos.fondoId, condominioId: datos.condominioId, administradoraId } });
  if (!fondo) throw new ErrorEgreso("Fondo no encontrado.");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Fondo" WHERE id = ${fondo.id} FOR UPDATE`;
    await enEgreso(exigirMesAbierto(tx, datos.condominioId, datos.fecha, "registrar un movimiento de fondo"));
    if (datos.tipo === "RETIRO") {
      const s = (await saldosFondos(datos.condominioId, administradoraId)).find((x) => x.fondo.id === fondo.id)!;
      if (datos.monto > s.saldo) throw new ErrorEgreso(`El fondo tiene ${s.saldo.toLocaleString("es-CL")} disponibles.`);
    }
    const mov = await tx.movimientoFondo.create({ data: { fondoId: fondo.id, tipo: datos.tipo, fecha: datos.fecha, monto: datos.monto, descripcion, creadoPor: autor.nombre } });
    await registrarEn(tx, {
      autor,
      accion: datos.tipo === "APORTE" ? "Registró un aporte a un fondo" : "Registró un retiro de un fondo",
      detalle: `${fondo.nombre}: ${descripcion} (${datos.monto.toLocaleString("es-CL")}).`,
      condominioId: datos.condominioId,
      entidad: "MovimientoFondo",
      entidadId: mov.id,
    });
    return mov;
  });
}
