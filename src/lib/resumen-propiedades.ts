import "server-only";
import { db } from "@/lib/db";

export type ResumenPropiedad = {
  id: string;
  nombre: string;
  rut: string | null;
  direccion: string;
  unidades: number;
  ultimoPeriodo: { id: string; anio: number; mes: number } | null;
  /** Avisos del último mes cerrado que tienen al menos un correo enviado (o simulado), sobre el total. */
  notificados: number;
  avisos: number;
  /** Porcentaje recaudado del último mes cerrado. */
  recaudacion: number | null;
  /** Porcentaje de unidades con deuda vencida. */
  morosidad: number;
};

/** Datos de las tarjetas de propiedades: último cobro emitido, recaudación y morosidad. */
export async function resumenPropiedades(administradoraId: string, ids?: string[]): Promise<ResumenPropiedad[]> {
  const ahora = new Date();
  const condominios = await db.condominio.findMany({
    where: { administradoraId, ...(ids ? { id: { in: ids } } : {}) },
    orderBy: { nombre: "asc" },
    include: {
      _count: { select: { unidades: true } },
      periodos: {
        where: { estado: "CERRADO" },
        orderBy: [{ anio: "desc" }, { mes: "desc" }],
        take: 1,
        include: {
          avisos: {
            select: {
              total: true,
              saldo: true,
              _count: { select: { envios: { where: { estado: { in: ["ENVIADO", "SIMULADO"] } } } } },
            },
          },
        },
      },
    },
  });
  const vencidos = await db.avisoCobro.findMany({
    where: { administradoraId, saldo: { gt: 0 }, vencimiento: { lt: ahora }, unidad: { condominioId: { in: condominios.map((c) => c.id) } } },
    select: { unidadId: true, unidad: { select: { condominioId: true } } },
  });

  return condominios.map((c) => {
    const p = c.periodos[0];
    const total = p?.avisos.reduce((s, a) => s + Number(a.total), 0) ?? 0;
    const saldo = p?.avisos.reduce((s, a) => s + Number(a.saldo), 0) ?? 0;
    const morosas = new Set(vencidos.filter((v) => v.unidad.condominioId === c.id).map((v) => v.unidadId)).size;
    return {
      id: c.id,
      nombre: c.nombre,
      rut: c.rut,
      direccion: `${c.direccion}${c.comuna ? `, ${c.comuna}` : ""}`,
      unidades: c._count.unidades,
      ultimoPeriodo: p ? { id: p.id, anio: p.anio, mes: p.mes } : null,
      notificados: p?.avisos.filter((a) => a._count.envios > 0).length ?? 0,
      avisos: p?.avisos.length ?? 0,
      recaudacion: total > 0 ? ((total - saldo) / total) * 100 : null,
      morosidad: c._count.unidades > 0 ? (morosas / c._count.unidades) * 100 : 0,
    };
  });
}
