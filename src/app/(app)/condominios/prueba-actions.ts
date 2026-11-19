"use server";

// FIN-COMP · Comunidad ficticia para probar el ciclo financiero (solo en vistas previas).

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { puedeVerPropiedad, requireAdministradora } from "@/lib/auth";
import { crearComunidadDemo, demoPermitida, nuevaClaveResidenteDemo } from "@/lib/demo-financiera";

export async function crearComunidadDemoAccion() {
  const { usuario } = await requireAdministradora("propiedades.crear");
  if (!demoPermitida()) redirect("/condominios/nuevo");
  const c = await crearComunidadDemo(usuario);
  revalidatePath("/", "layout");
  redirect(`/condominios/${c.id}/prueba`);
}

export type EstadoClave = { correo?: string; clave?: string; mensaje?: string };

export async function claveResidenteDemoAccion(condominioId: string): Promise<EstadoClave> {
  const { usuario, administradoraId } = await requireAdministradora("propiedad.administrar");
  if (!puedeVerPropiedad(usuario, condominioId)) return { mensaje: "Comunidad no encontrada." };
  const r = await nuevaClaveResidenteDemo(condominioId, administradoraId);
  return r ?? { mensaje: "Solo disponible en comunidades de prueba, en la vista previa." };
}
