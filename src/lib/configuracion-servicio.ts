import "server-only";
import { db } from "@/lib/db";
import type { DatosConfiguracion } from "./configuracion";

/** Junta lo que el configurador necesita de varias propiedades (para Mis propiedades y el panel). */
export async function datosConfiguracion(administradoraId: string, ids: string[]): Promise<Map<string, DatosConfiguracion>> {
  if (ids.length === 0) return new Map();
  const [condominios, sinPropietario, emitidos] = await Promise.all([
    db.condominio.findMany({
      where: { administradoraId, id: { in: ids } },
      select: {
        id: true,
        estado: true,
        nombre: true,
        direccion: true,
        tipo: true,
        modalidad: true,
        fechaIncorporacion: true,
        totalUnidades: true,
        unidades: { select: { alicuota: true } },
        _count: { select: { agrupaciones: true, espacios: true, instalaciones: true } },
        apertura: { select: { estado: true, fechaCorte: true, _count: { select: { deudas: true, fondos: true, cuentas: true } } } },
      },
    }),
    db.unidad.groupBy({
      by: ["condominioId"],
      where: { administradoraId, condominioId: { in: ids }, personas: { none: { relacion: "PROPIETARIO" } } },
      _count: { _all: true },
    }),
    db.periodo.groupBy({
      by: ["condominioId"],
      where: { administradoraId, condominioId: { in: ids }, estado: "CERRADO" },
      _count: { _all: true },
    }),
  ]);
  const sin = new Map(sinPropietario.map((g) => [g.condominioId, g._count._all]));
  const cerr = new Map(emitidos.map((g) => [g.condominioId, g._count._all]));
  return new Map(
    condominios.map((c) => [
      c.id,
      {
        estado: c.estado,
        nombre: c.nombre,
        direccion: c.direccion,
        tipo: c.tipo,
        modalidad: c.modalidad,
        fechaIncorporacion: c.fechaIncorporacion,
        totalUnidades: c.totalUnidades,
        unidades: c.unidades.length,
        sumaAlicuotas: Math.round(c.unidades.reduce((s, u) => s + Number(u.alicuota), 0) * 1e6) / 1e6,
        unidadesSinPropietario: sin.get(c.id) ?? 0,
        cobrosEmitidos: cerr.get(c.id) ?? 0,
        estructura: c._count,
        apertura: c.apertura ? { estado: c.apertura.estado, fechaCorte: c.apertura.fechaCorte, ...c.apertura._count } : null,
      },
    ]),
  );
}

export async function datosDeUna(administradoraId: string, id: string) {
  return (await datosConfiguracion(administradoraId, [id])).get(id) ?? null;
}
