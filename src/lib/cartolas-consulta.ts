import "server-only";
// FIN-003.1 · Consulta de movimientos bancarios: el mismo filtro para la pantalla y para el CSV.

import type { Prisma } from "@/generated/prisma/client";
import { ESTADOS_CONCILIACION } from "@/lib/cartolas";

export type FiltroMovimientos = { cuenta?: string; estado?: string; tipo?: string; desde?: string; hasta?: string; q?: string };

const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim().slice(0, 100) || undefined;
const esDia = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);

/** Lee los filtros de la dirección (?cuenta=&estado=&tipo=&desde=&hasta=&q=) descartando valores raros. */
export function leerFiltro(sp: Record<string, string | string[] | undefined>): FiltroMovimientos {
  const estado = uno(sp.estado);
  const tipo = uno(sp.tipo);
  return {
    cuenta: uno(sp.cuenta),
    estado: estado && estado in ESTADOS_CONCILIACION ? estado : undefined,
    tipo: tipo === "cargo" || tipo === "abono" ? tipo : undefined,
    desde: esDia(uno(sp.desde)),
    hasta: esDia(uno(sp.hasta)),
    q: uno(sp.q),
  };
}

/** Condición de búsqueda, siempre dentro de la comunidad y la administradora. */
export function dondeMovimientos(condominioId: string, administradoraId: string, f: FiltroMovimientos): Prisma.MovimientoBancarioWhereInput {
  return {
    condominioId,
    administradoraId,
    ...(f.cuenta ? { cuentaId: f.cuenta } : {}),
    ...(f.estado ? { estado: f.estado as keyof typeof ESTADOS_CONCILIACION } : {}),
    ...(f.tipo === "cargo" ? { monto: { lt: 0 } } : f.tipo === "abono" ? { monto: { gt: 0 } } : {}),
    ...(f.desde || f.hasta
      ? { fecha: { ...(f.desde ? { gte: new Date(`${f.desde}T00:00:00Z`) } : {}), ...(f.hasta ? { lte: new Date(`${f.hasta}T00:00:00Z`) } : {}) } }
      : {}),
    ...(f.q
      ? {
          OR: [
            { descripcion: { contains: f.q, mode: "insensitive" as const } },
            { referencia: { contains: f.q, mode: "insensitive" as const } },
            { contraparte: { contains: f.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
}

/**
 * Celda de texto segura para CSV: entre comillas y, si empieza como fórmula (=, +, -, @, tabulación),
 * con un apóstrofo delante para que Excel la muestre como texto y no la ejecute.
 */
export function celdaCsv(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "number") return String(valor).replace(".", ",");
  const s = /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
  return `"${s.replace(/"/g, '""')}"`;
}
