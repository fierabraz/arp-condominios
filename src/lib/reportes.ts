import "server-only";
import { db } from "@/lib/db";

const n = (x: { toString(): string } | null | undefined) => Number(x?.toString() ?? 0);
const redondear = (x: number) => Math.round(x * 100) / 100;

/** Todo lo necesario para imprimir un aviso de cobro. */
export async function datosAviso(avisoId: string, administradoraId: string) {
  const aviso = await db.avisoCobro.findFirst({
    where: { id: avisoId, administradoraId },
    include: {
      administradora: { select: { nombre: true, moneda: true } },
      periodo: {
        include: {
          gastos: { orderBy: [{ fecha: "asc" }, { creadoEn: "asc" }] },
          condominio: true,
        },
      },
      unidad: { include: { personas: { include: { persona: { select: { nombre: true } } } } } },
    },
  });
  if (!aviso) return null;

  // Deuda de avisos anteriores aún impaga y saldo a favor actual de la unidad.
  const [anteriores, pagos] = await Promise.all([
    db.avisoCobro.findMany({
      where: { unidadId: aviso.unidadId, saldo: { gt: 0 }, vencimiento: { lt: aviso.vencimiento } },
      select: { saldo: true },
    }),
    db.pago.findMany({
      where: { unidadId: aviso.unidadId },
      select: { monto: true, aplicaciones: { select: { monto: true } } },
    }),
  ]);
  const deudaAnterior = redondear(anteriores.reduce((s, a) => s + n(a.saldo), 0));
  const aFavor = redondear(
    pagos.reduce((s, p) => s + n(p.monto) - p.aplicaciones.reduce((t, a) => t + n(a.monto), 0), 0),
  );

  const comunes = aviso.periodo.gastos.filter((g) => g.tipo === "COMUN");
  const porCategoria = agrupar(comunes);
  const cargos = aviso.periodo.gastos.filter((g) => g.tipo === "INDIVIDUAL" && g.unidadId === aviso.unidadId);

  return {
    aviso,
    porCategoria,
    totalComun: redondear(comunes.reduce((s, g) => s + n(g.monto), 0)),
    cargos,
    deudaAnterior,
    aFavor,
    totalAPagar: redondear(Math.max(n(aviso.saldo) + deudaAnterior, 0)),
  };
}

function agrupar(gastos: { categoria: string; monto: { toString(): string } }[]) {
  const mapa = new Map<string, number>();
  for (const g of gastos) mapa.set(g.categoria, (mapa.get(g.categoria) ?? 0) + n(g.monto));
  const total = [...mapa.values()].reduce((a, b) => a + b, 0);
  return [...mapa.entries()]
    .map(([categoria, monto]) => ({ categoria, monto: redondear(monto), porcentaje: total ? (monto / total) * 100 : 0 }))
    .sort((a, b) => b.monto - a.monto);
}

/** Rendición mensual de un período cerrado: gastos, cobranza y morosidad. */
export async function datosRendicion(periodoId: string, administradoraId: string) {
  const periodo = await db.periodo.findFirst({
    where: { id: periodoId, administradoraId },
    include: {
      condominio: true,
      administradora: { select: { nombre: true, moneda: true } },
      gastos: {
        orderBy: [{ fecha: "asc" }, { creadoEn: "asc" }],
        include: { unidad: { select: { numero: true } } },
      },
      avisos: {
        include: { unidad: { select: { numero: true } }, aplicaciones: { select: { monto: true } } },
      },
    },
  });
  if (!periodo) return null;

  const comunes = periodo.gastos.filter((g) => g.tipo === "COMUN");
  const individuales = periodo.gastos.filter((g) => g.tipo === "INDIVIDUAL");
  const emitido = periodo.avisos.reduce((s, a) => s + n(a.total), 0);
  const recaudado = periodo.avisos.reduce((s, a) => s + a.aplicaciones.reduce((t, x) => t + n(x.monto), 0), 0);
  const pendiente = periodo.avisos.reduce((s, a) => s + n(a.saldo), 0);
  const reservaPeriodo = periodo.avisos.reduce((s, a) => s + n(a.fondoReserva), 0);

  // Fondo de reserva emitido acumulado hasta este período (incluido).
  const reservaAcumulada = await db.avisoCobro.aggregate({
    where: {
      periodo: {
        condominioId: periodo.condominioId,
        OR: [{ anio: { lt: periodo.anio } }, { anio: periodo.anio, mes: { lte: periodo.mes } }],
      },
    },
    _sum: { fondoReserva: true },
  });

  const impagos = periodo.avisos
    .filter((a) => n(a.saldo) > 0)
    .map((a) => ({ numero: a.unidad.numero, saldo: n(a.saldo), total: n(a.total) }))
    .sort((a, b) => a.numero.localeCompare(b.numero, "es", { numeric: true }));

  return {
    periodo,
    porCategoria: agrupar(comunes),
    comunes,
    individuales,
    totalComun: redondear(comunes.reduce((s, g) => s + n(g.monto), 0)),
    totalIndividual: redondear(individuales.reduce((s, g) => s + n(g.monto), 0)),
    emitido: redondear(emitido),
    recaudado: redondear(recaudado),
    pendiente: redondear(pendiente),
    porcentajeRecaudado: emitido ? (recaudado / emitido) * 100 : 0,
    reservaPeriodo: redondear(reservaPeriodo),
    reservaAcumulada: redondear(n(reservaAcumulada._sum.fondoReserva)),
    impagos,
    unidades: periodo.avisos.length,
  };
}
