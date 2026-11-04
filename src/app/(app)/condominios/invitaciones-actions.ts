"use server";

import { revalidatePath } from "next/cache";
import { requireAdministradora } from "@/lib/auth";
import { estadoAcceso, puedeInvitar } from "@/lib/invitacion-estado";
import { invitarPersona, personasDePropiedad, type ResultadoInvitacion } from "@/lib/invitaciones";

/** Máximo de invitaciones de una vez, para no exceder el tiempo de una petición. */
const MAXIMO_POR_VEZ = 100;

export async function invitar(personaId: string, condominioId?: string): Promise<ResultadoInvitacion> {
  const { usuario, administradoraId } = await requireAdministradora();
  const r = await invitarPersona(usuario, administradoraId, personaId, condominioId);
  if (condominioId) revalidatePath(`/condominios/${condominioId}/invitaciones`);
  revalidatePath(`/personas/${personaId}`);
  return r;
}

/** Invita a todas las personas de la propiedad que tienen correo y todavía no tienen acceso. */
export async function invitarPendientes(condominioId: string): Promise<ResultadoInvitacion[]> {
  const { usuario, administradoraId } = await requireAdministradora();
  const personas = await personasDePropiedad(condominioId, administradoraId);
  const pendientes = personas.filter((p) => {
    const estado = estadoAcceso(p.correo, p.usuario && { ...p.usuario, invitaciones: p.usuario.tokensRecuperacion });
    // Las invitaciones aún vigentes no se renuevan solas: ya tienen su enlace.
    return puedeInvitar(estado) && estado !== "INVITADA";
  });
  const resultados: ResultadoInvitacion[] = [];
  for (const p of pendientes.slice(0, MAXIMO_POR_VEZ)) {
    resultados.push(await invitarPersona(usuario, administradoraId, p.id, condominioId));
  }
  revalidatePath(`/condominios/${condominioId}/invitaciones`);
  return resultados;
}
