import "server-only";
import { db } from "@/lib/db";
import { arbolAgrupaciones, opcionesAgrupaciones } from "@/lib/estructura";
import { ETIQUETAS_TIPO_UNIDAD } from "@/lib/formato";

/** Opciones para los formularios: agrupaciones con su ruta, unidades, personas y proveedores. */
export async function opcionesEstructura(condominioId: string, administradoraId: string) {
  const [agrupaciones, unidades, personas, proveedores] = await Promise.all([
    db.agrupacion.findMany({ where: { condominioId }, select: { id: true, tipo: true, nombre: true, padreId: true, orden: true } }),
    db.unidad.findMany({ where: { condominioId }, select: { id: true, numero: true, tipo: true }, orderBy: { numero: "asc" } }),
    db.persona.findMany({
      where: { administradoraId, unidades: { some: { unidad: { condominioId } } } },
      select: { id: true, nombre: true },
      orderBy: { nombre: "asc" },
    }),
    db.proveedor.findMany({ where: { administradoraId }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
  ]);
  const arbol = arbolAgrupaciones(agrupaciones);
  return {
    agrupaciones,
    arbol,
    opcionesAgrupacion: opcionesAgrupaciones(agrupaciones),
    opcionesUnidad: unidades
      .sort((a, b) => a.numero.localeCompare(b.numero, "es", { numeric: true }))
      .map((u) => ({ id: u.id, texto: `${u.numero} (${ETIQUETAS_TIPO_UNIDAD[u.tipo].toLowerCase()})` })),
    opcionesPersona: personas.map((p) => ({ id: p.id, texto: p.nombre })),
    opcionesProveedor: proveedores.map((p) => ({ id: p.id, texto: p.nombre })),
  };
}
