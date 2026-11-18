import "server-only";
// FIN-COMP · Entrega C · Cierre del mes: revisión, cierre con resumen fijo, reapertura auditada y
// bloqueo de lo que tenga fecha de un mes cerrado.

import { db } from "@/lib/db";
import type { UsuarioActual } from "@/lib/auth";
import { registrarEn } from "@/lib/registro";
import { nombrePeriodo } from "@/lib/cobro";
import { rangoMes, revisarCierre } from "@/lib/cierre";
import { saldosFondos } from "@/lib/egresos-servicio";

type Autor = Pick<UsuarioActual, "id" | "nombre" | "administradoraId">;

export class ErrorCierre extends Error {}


const n = (v: { toString(): string } | null | undefined) => Number(v?.toString() ?? 0);
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Todo lo que se revisa y se resume al cerrar el mes. Misma fuente que Recaudación y Conciliación. */
export async function datosCierre(periodoId: string, administradoraId: string) {
  const p = await db.periodo.findFirst({
    where: { id: periodoId, administradoraId },
    include: { condominio: { select: { id: true, nombre: true } }, avisos: { select: { total: true, saldo: true, vencimiento: true } } },
  });
  if (!p) return null;
  const condominioId = p.condominioId;
  const { desde, hasta } = rangoMes(p.anio, p.mes);
  const enRango = { gte: desde, lte: hasta };
  const [anteriores, movimientos, transferencias, gastos, pagos, otros, cuentas, morosidad] = await Promise.all([
    db.periodo.findMany({
      where: { condominioId, mesCerradoEn: null, OR: [{ anio: { lt: p.anio } }, { anio: p.anio, mes: { lt: p.mes } }] },
      select: { anio: true, mes: true },
      orderBy: [{ anio: "asc" }, { mes: "asc" }],
    }),
    db.movimientoBancario.findMany({ where: { condominioId, fecha: enRango }, select: { monto: true, estado: true, saldo: true, fecha: true, cuentaId: true, creadoEn: true } }),
    db.transferenciaInformada.aggregate({ where: { condominioId, estado: { in: ["INFORMADA", "EN_REVISION"] } }, _count: true, _sum: { monto: true } }),
    db.gasto.findMany({
      where: { periodoId, tipo: "COMUN" },
      select: { monto: true, estadoPago: true, fondoId: true, _count: { select: { respaldos: true } } },
    }),
    db.pago.findMany({
      where: { unidad: { condominioId }, anuladoEn: null, fecha: enRango },
      select: { monto: true, medio: true, conciliaciones: { where: { anuladaEn: null }, select: { id: true } } },
    }),
    db.conciliacionMovimiento.findMany({
      where: { condominioId, anuladaEn: null, tipo: { in: ["OTRO_INGRESO", "OTRO_EGRESO"] }, movimiento: { fecha: enRango } },
      select: { tipo: true, monto: true },
    }),
    db.cuentaBancaria.findMany({ where: { condominioId }, select: { id: true, banco: true, numeroFinal: true } }),
    db.avisoCobro.aggregate({ where: { unidad: { condominioId }, saldo: { gt: 0 }, vencimiento: { lt: new Date() } }, _sum: { saldo: true } }),
  ]);
  const egresosPagados = await db.gasto.aggregate({
    where: { periodo: { condominioId }, tipo: "COMUN", estadoPago: "PAGADO", fondoId: null, fechaPago: enRango },
    _sum: { monto: true },
  });
  const fondos = await saldosFondos(condominioId, administradoraId, hasta);
  const bancos = cuentas.map((c) => {
    const ms = movimientos.filter((m) => m.cuentaId === c.id).sort((a, b) => a.fecha.getTime() - b.fecha.getTime() || a.creadoEn.getTime() - b.creadoEn.getTime());
    const ultimo = [...ms].reverse().find((m) => m.saldo !== null);
    return {
      cuenta: `${c.banco} ···${c.numeroFinal}`,
      movimientos: ms.length,
      abonos: r2(ms.filter((m) => n(m.monto) > 0).reduce((s, m) => s + n(m.monto), 0)),
      cargos: r2(ms.filter((m) => n(m.monto) < 0).reduce((s, m) => s - n(m.monto), 0)),
      saldoFinal: ultimo ? n(ultimo.saldo) : null,
    };
  });
  const revision = revisarCierre({
    emitido: p.estado === "CERRADO",
    yaCerrado: !!p.mesCerradoEn,
    anterioresSinCerrar: anteriores.map((a) => nombrePeriodo(a.anio, a.mes)),
    movimientosSinConciliar: movimientos.filter((m) => m.estado !== "CONCILIADO").length,
    movimientosDelMes: movimientos.length,
    transferenciasPendientes: transferencias._count,
    egresosPorPagar: gastos.filter((g) => g.estadoPago === "POR_PAGAR").length,
    egresosSinRespaldo: gastos.filter((g) => g._count.respaldos === 0).length,
    pagosSinCartola: pagos.filter((x) => x.conciliaciones.length === 0 && x.medio !== "EFECTIVO").length,
  });
  const resumen = {
    periodo: nombrePeriodo(p.anio, p.mes),
    comunidad: p.condominio.nombre,
    emitido: r2(p.avisos.reduce((s, a) => s + n(a.total), 0)),
    pendienteDelMes: r2(p.avisos.reduce((s, a) => s + n(a.saldo), 0)),
    gastosComunes: r2(gastos.filter((g) => !g.fondoId).reduce((s, g) => s + n(g.monto), 0)),
    gastosConFondo: r2(gastos.filter((g) => g.fondoId).reduce((s, g) => s + n(g.monto), 0)),
    ingresosDelMes: r2(pagos.reduce((s, x) => s + n(x.monto), 0)),
    pagosDelMes: pagos.length,
    otrosIngresos: r2(otros.filter((o) => o.tipo === "OTRO_INGRESO").reduce((s, o) => s + n(o.monto), 0)),
    egresosPagadosDelMes: r2(n(egresosPagados._sum.monto)),
    otrosEgresos: r2(otros.filter((o) => o.tipo === "OTRO_EGRESO").reduce((s, o) => s + n(o.monto), 0)),
    morosidadVencida: r2(n(morosidad._sum.saldo)),
    transferenciasPendientes: { cantidad: transferencias._count, monto: r2(n(transferencias._sum.monto)) },
    bancos,
    fondos: fondos.map((f) => ({ nombre: f.fondo.nombre, saldo: f.saldo })),
    advertencias: revision.advertencias,
  };
  return { periodo: p, revision, resumen };
}

export type ResumenCierre = NonNullable<Awaited<ReturnType<typeof datosCierre>>>["resumen"] & { cerradoEn: string; cerradoPor: string };

export async function cerrarMes(autor: Autor, periodoId: string, confirmaAdvertencias: boolean) {
  const administradoraId = autor.administradoraId!;
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Periodo" WHERE id = ${periodoId} FOR UPDATE`;
    // La revisión se hace con el período bloqueado (nadie lo cierra dos veces a la vez).
    const d = await datosCierre(periodoId, administradoraId);
    if (!d) throw new ErrorCierre("Período no encontrado.");
    if (d.revision.bloqueos.length) throw new ErrorCierre(d.revision.bloqueos.join(" "));
    if (d.revision.advertencias.length && !confirmaAdvertencias) throw new ErrorCierre("Revisa las advertencias y confirma que quieres cerrar igual.");
    const ahora = new Date();
    const resumen: ResumenCierre = { ...d.resumen, cerradoEn: ahora.toISOString(), cerradoPor: autor.nombre };
    await tx.periodo.update({ where: { id: periodoId }, data: { mesCerradoEn: ahora, mesCerradoPor: autor.nombre, resumenCierre: resumen } });
    await registrarEn(tx, {
      autor,
      accion: "Cerró el mes",
      detalle: `${d.resumen.periodo} en ${d.resumen.comunidad}.${d.revision.advertencias.length ? ` Con ${d.revision.advertencias.length} advertencia(s) confirmada(s).` : ""}`,
      condominioId: d.periodo.condominioId,
      entidad: "Periodo",
      entidadId: periodoId,
      antes: { estado: "Avisos emitidos" },
      despues: { estado: "Mes cerrado" },
    });
    return resumen;
  });
}

/** Reabre un mes cerrado (solo el principal, con motivo). Si hay meses posteriores cerrados, no se puede. */
export async function reabrirMes(autor: Autor, periodoId: string, motivo: string) {
  const administradoraId = autor.administradoraId!;
  if (motivo.trim().length < 10) throw new ErrorCierre("Explica por qué se reabre (mínimo 10 letras).");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Periodo" WHERE id = ${periodoId} FOR UPDATE`;
    const p = await tx.periodo.findFirst({ where: { id: periodoId, administradoraId } });
    if (!p || !p.mesCerradoEn) throw new ErrorCierre("Ese mes no está cerrado.");
    const posterior = await tx.periodo.findFirst({
      where: { condominioId: p.condominioId, mesCerradoEn: { not: null }, OR: [{ anio: { gt: p.anio } }, { anio: p.anio, mes: { gt: p.mes } }] },
    });
    if (posterior) throw new ErrorCierre(`Primero reabre ${nombrePeriodo(posterior.anio, posterior.mes)} (los meses se reabren del más reciente al más antiguo).`);
    await tx.periodo.update({
      where: { id: periodoId },
      data: { mesCerradoEn: null, mesCerradoPor: null, reabiertoEn: new Date(), reabiertoPor: autor.nombre, motivoReapertura: motivo.trim().slice(0, 500) },
    });
    await registrarEn(tx, {
      autor,
      accion: "Reabrió un mes cerrado",
      detalle: `${nombrePeriodo(p.anio, p.mes)}: ${motivo.trim()}`,
      condominioId: p.condominioId,
      entidad: "Periodo",
      entidadId: periodoId,
      antes: { estado: "Mes cerrado", cerradoEn: p.mesCerradoEn.toISOString(), cerradoPor: p.mesCerradoPor, resumen: p.resumenCierre },
      despues: { estado: "Avisos emitidos" },
    });
  });
}

