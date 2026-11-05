import "server-only";
// COM-001 · Entrega 3: el historial de vínculos (VinculoUnidad) es la fuente; UnidadPersona es la
// foto de hoy que usan cobros, votaciones y la app de residentes, y se recalcula en cada cambio.

import type { Prisma } from "@/generated/prisma/client";
import { hoyDia } from "./estructura";
import { relacionesVigentes, revisarVinculo, type TipoVinculo } from "./vinculos";

type Tx = Prisma.TransactionClient;

/** Deja UnidadPersona de esa persona en esa unidad igual a lo que dicen sus vínculos vigentes. */
export async function sincronizarRelaciones(tx: Tx, unidadId: string, personaId: string) {
  const vinculos = await tx.vinculoUnidad.findMany({ where: { unidadId, personaId }, select: { tipo: true, hasta: true } });
  const deben = relacionesVigentes(vinculos);
  await tx.unidadPersona.deleteMany({ where: { unidadId, personaId, relacion: { notIn: deben } } });
  for (const relacion of deben) {
    await tx.unidadPersona.upsert({
      where: { unidadId_personaId_relacion: { unidadId, personaId, relacion } },
      create: { unidadId, personaId, relacion },
      update: {},
    });
  }
}

export type DatosVinculo = {
  administradoraId: string;
  unidadId: string;
  personaId: string;
  tipo: TipoVinculo;
  desde: Date | null;
  terminoPrevisto?: Date | null;
  respaldo?: string | null;
  observaciones?: string | null;
  creadoPor: string;
};

/**
 * Registra un vínculo nuevo si no repite ni contradice uno vigente. Bloquea la unidad mientras
 * revisa, para que dos personas guardando a la vez no dejen dos propietarios.
 * Devuelve el error, o null si se guardó.
 */
export async function crearVinculo(tx: Tx, d: DatosVinculo): Promise<string | null> {
  await tx.$queryRaw`SELECT id FROM "Unidad" WHERE id = ${d.unidadId} FOR UPDATE`;
  const existentes = await tx.vinculoUnidad.findMany({
    where: { unidadId: d.unidadId },
    select: { personaId: true, tipo: true, hasta: true, persona: { select: { nombre: true } } },
  });
  // Un vínculo sin fecha (carga desde Excel) se revisa como si empezara hoy.
  const hoy = hoyDia();
  const error = revisarVinculo(
    { personaId: d.personaId, tipo: d.tipo, desde: d.desde ?? hoy, terminoPrevisto: d.terminoPrevisto ?? null },
    existentes.map((e) => ({ personaId: e.personaId, nombre: e.persona.nombre, tipo: e.tipo, hasta: e.hasta })),
    hoy,
  );
  if (error) return error;
  await tx.vinculoUnidad.create({
    data: {
      administradoraId: d.administradoraId,
      unidadId: d.unidadId,
      personaId: d.personaId,
      tipo: d.tipo,
      desde: d.desde,
      terminoPrevisto: d.terminoPrevisto ?? null,
      respaldo: d.respaldo ?? null,
      observaciones: d.observaciones ?? null,
      creadoPor: d.creadoPor,
    },
  });
  await sincronizarRelaciones(tx, d.unidadId, d.personaId);
  return null;
}

/** Termina un vínculo vigente con fecha "hasta" (hoy o antes). No se borra: queda en el historial. */
export async function terminarVinculo(tx: Tx, vinculoId: string, hasta: Date, por: string): Promise<string | null> {
  const v = await tx.vinculoUnidad.findUnique({ where: { id: vinculoId } });
  if (!v) return "No encontrado.";
  if (v.hasta) return "Este vínculo ya terminó.";
  if (hasta > hoyDia()) return "La fecha de término no puede ser futura. Termínalo cuando ocurra.";
  if (v.desde && hasta < v.desde) return "La fecha de término es anterior a la de inicio.";
  await tx.vinculoUnidad.update({ where: { id: v.id }, data: { hasta, terminadoPor: por, terminadoEn: new Date() } });
  await sincronizarRelaciones(tx, v.unidadId, v.personaId);
  return null;
}
