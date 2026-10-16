import "server-only";
import { db } from "@/lib/db";
import { estadoEfectivo, resultados } from "@/lib/votacion";

export class ErrorVotacion extends Error {}

/** Votación con sus opciones, votos y resultados, si pertenece a la propiedad indicada. */
export async function cargarVotacion(votacionId: string, condominioId: string) {
  const v = await db.votacion.findFirst({
    where: { id: votacionId, condominioId },
    include: {
      opciones: { orderBy: { orden: "asc" } },
      votos: {
        orderBy: { creadoEn: "asc" },
        include: { unidad: { select: { numero: true, alicuota: true } }, opcion: { select: { texto: true } } },
      },
    },
  });
  if (!v) return null;
  const unidades = await db.unidad.findMany({
    where: { condominioId },
    orderBy: { numero: "asc" },
    select: { id: true, numero: true, alicuota: true },
  });
  const r = resultados(
    v.opciones,
    v.votos.map((x) => ({ opcionId: x.opcionId, alicuota: Number(x.unidad.alicuota) })),
    unidades.map((u) => ({ alicuota: Number(u.alicuota) })),
    v.ponderacion,
  );
  return { votacion: v, estado: estadoEfectivo(v), resultados: r, unidades };
}

/** Registra el voto de una unidad. Cada unidad vota una sola vez. */
export async function emitirVoto(datos: {
  votacionId: string;
  opcionId: string;
  unidadId: string;
  emitidoPor: string;
  presencial: boolean;
}) {
  const v = await db.votacion.findUnique({ where: { id: datos.votacionId }, include: { opciones: { select: { id: true } } } });
  if (!v || estadoEfectivo(v) !== "ABIERTA") throw new ErrorVotacion("La votación no está abierta.");
  if (!v.opciones.some((o) => o.id === datos.opcionId)) throw new ErrorVotacion("Elige una opción.");
  const unidad = await db.unidad.findFirst({ where: { id: datos.unidadId, condominioId: v.condominioId } });
  if (!unidad) throw new ErrorVotacion("Unidad no encontrada.");
  const ya = await db.voto.findUnique({ where: { votacionId_unidadId: { votacionId: v.id, unidadId: unidad.id } } });
  if (ya) throw new ErrorVotacion(`La unidad ${unidad.numero} ya votó.`);
  try {
    return await db.voto.create({ data: datos });
  } catch {
    // Dos votos simultáneos de la misma unidad: el índice único deja pasar solo uno.
    throw new ErrorVotacion(`La unidad ${unidad.numero} ya votó.`);
  }
}

/** Unidades de la propiedad donde la persona es propietaria: son las que puede votar. */
export async function unidadesConVoto(personaId: string, condominioId: string) {
  const vinculos = await db.unidadPersona.findMany({
    where: { personaId, relacion: "PROPIETARIO", unidad: { condominioId } },
    include: { unidad: { select: { id: true, numero: true } } },
    orderBy: { unidad: { numero: "asc" } },
  });
  return vinculos.map((v) => v.unidad);
}
