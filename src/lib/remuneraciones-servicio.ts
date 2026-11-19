import "server-only";
// FIN-COMP · Entrega D · Remuneraciones básicas. Convive no calcula liquidaciones: guarda los montos
// que informa el contador y, cada mes, los carga como egresos «por pagar» del gasto común
// (sueldo líquido e imposiciones por separado). Después se pagan y concilian como cualquier egreso.

import { db } from "@/lib/db";
import type { UsuarioActual } from "@/lib/auth";
import { registrarEn } from "@/lib/registro";
import { nombrePeriodo } from "@/lib/cobro";
import { rangoMes } from "@/lib/cierre";

type Autor = Pick<UsuarioActual, "id" | "nombre" | "administradoraId">;

export class ErrorRemuneracion extends Error {}

export async function cargarRemuneraciones(autor: Autor, periodoId: string) {
  const administradoraId = autor.administradoraId!;
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Periodo" WHERE id = ${periodoId} FOR UPDATE`;
    const p = await tx.periodo.findFirst({ where: { id: periodoId, administradoraId } });
    if (!p) throw new ErrorRemuneracion("Período no encontrado.");
    if (p.estado !== "ABIERTO") throw new ErrorRemuneracion(`${nombrePeriodo(p.anio, p.mes)} ya emitió sus avisos: las remuneraciones se cargan con el mes abierto.`);
    const trabajadores = await tx.trabajador.findMany({ where: { condominioId: p.condominioId, administradoraId, activo: true }, orderBy: { nombre: "asc" } });
    if (trabajadores.length === 0) throw new ErrorRemuneracion("No hay trabajadores activos registrados.");
    const ya = new Set((await tx.gasto.findMany({ where: { periodoId, trabajadorId: { not: null } }, select: { trabajadorId: true } })).map((g) => g.trabajadorId));
    const fecha = new Date(rangoMes(p.anio, p.mes).hasta.toISOString().slice(0, 10) + "T00:00:00Z");
    const mes = nombrePeriodo(p.anio, p.mes).toLowerCase();
    let cargados = 0;
    let total = 0;
    for (const t of trabajadores.filter((t) => !ya.has(t.id))) {
      const base = { administradoraId, periodoId, tipo: "COMUN" as const, categoria: "Remuneraciones", fecha, estadoPago: "POR_PAGAR" as const, trabajadorId: t.id, proveedor: t.nombre };
      await tx.gasto.create({ data: { ...base, descripcion: `Sueldo líquido ${mes} · ${t.cargo}`, monto: t.liquido } });
      total += Number(t.liquido);
      if (Number(t.imposiciones) > 0) {
        await tx.gasto.create({ data: { ...base, descripcion: `Imposiciones ${mes} · ${t.cargo}`, monto: t.imposiciones } });
        total += Number(t.imposiciones);
      }
      cargados++;
    }
    if (cargados === 0) throw new ErrorRemuneracion(`Las remuneraciones de ${mes} ya estaban cargadas.`);
    await registrarEn(tx, {
      autor,
      accion: "Cargó las remuneraciones del mes",
      detalle: `${nombrePeriodo(p.anio, p.mes)}: ${cargados} trabajador(es), total ${total}. Quedan como egresos por pagar.`,
      condominioId: p.condominioId,
      entidad: "Periodo",
      entidadId: periodoId,
    });
    return { cargados, total, omitidos: trabajadores.length - cargados };
  });
}
