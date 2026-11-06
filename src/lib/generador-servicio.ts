import "server-only";
import { db } from "@/lib/db";
import { normalizar, type Existentes, type Registros } from "@/lib/generador";

type Cliente = Pick<typeof db, "agrupacion" | "unidad" | "espacio" | "instalacion">;

/** Lo que ya existe en la comunidad (cargado a mano, por Excel o por el generador). */
export async function existentesDe(condominioId: string, cliente: Cliente = db): Promise<Existentes> {
  const [agrupaciones, unidades, espacios, instalaciones] = await Promise.all([
    cliente.agrupacion.findMany({ where: { condominioId }, select: { id: true, tipo: true, nombre: true, padreId: true }, orderBy: { creadoEn: "asc" } }),
    cliente.unidad.findMany({ where: { condominioId }, select: { id: true, numero: true, agrupacionId: true }, orderBy: { creadoEn: "asc" } }),
    cliente.espacio.findMany({ where: { condominioId }, select: { id: true, clase: true, codigo: true }, orderBy: { creadoEn: "asc" } }),
    cliente.instalacion.findMany({ where: { condominioId }, select: { id: true, codigo: true, nombre: true }, orderBy: { creadoEn: "asc" } }),
  ]);
  return { agrupaciones, unidades, espacios, instalaciones };
}

export function registrosDe(v: unknown): Registros {
  const r: Registros = {};
  if (v && typeof v === "object" && !Array.isArray(v)) {
    for (const [k, id] of Object.entries(v)) if (typeof id === "string") r[k] = id;
  }
  return r;
}

/** Todo lo que la página del generador necesita. */
export async function datosGenerador(condominioId: string, tipoComunidad: string | null) {
  const [plano, existentes, posiciones] = await Promise.all([
    db.planoComunidad.findUnique({ where: { condominioId } }),
    existentesDe(condominioId),
    db.elementoPlano.findMany({ where: { condominioId }, select: { tipo: true, registroId: true, x: true, y: true } }),
  ]);
  const respuestas = normalizar(plano?.respuestas ?? {});
  // Una comunidad creada con el formulario: se propone el tipo según lo que ya indicó.
  if (!plano && !respuestas.tipo) {
    respuestas.tipo = tipoComunidad === "CONDOMINIO_CASAS" ? "CASAS" : tipoComunidad === "MIXTO" ? "MIXTA" : tipoComunidad === "EDIFICIO" ? "EDIFICIOS" : null;
  }
  return {
    respuestas,
    registros: registrosDe(plano?.registros),
    generadoEn: plano?.generadoEn?.toISOString() ?? null,
    guardadoEn: plano?.actualizadoEn?.toISOString() ?? null,
    existentes,
    posiciones: Object.fromEntries(posiciones.map((p) => [`${p.tipo}:${p.registroId}`, { x: p.x, y: p.y }])),
  };
}
