"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdministradora } from "@/lib/auth";
import { aTexto, erroresDe, type EstadoForm } from "@/lib/forms";

const PublicacionSchema = z.object({
  titulo: z.string({ error: "Ingresa un título." }).min(3, { error: "Ingresa un título." }).max(150),
  contenido: z.string({ error: "Escribe el contenido." }).min(3, { error: "Escribe el contenido." }).max(10_000),
});

function leer(formData: FormData) {
  return PublicacionSchema.safeParse({
    titulo: aTexto(formData.get("titulo")),
    contenido: aTexto(formData.get("contenido")),
  });
}

export async function crearPublicacion(condominioId: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const { usuario, administradoraId } = await requireAdministradora();
  const datos = leer(formData);
  if (!datos.success) return erroresDe(datos.error);
  if (!(await db.condominio.findFirst({ where: { id: condominioId, administradoraId } }))) {
    return { mensaje: "Propiedad no encontrada." };
  }
  await db.publicacion.create({ data: { ...datos.data, condominioId, administradoraId, autor: usuario.nombre } });
  revalidatePath(`/condominios/${condominioId}`, "layout");
  redirect(`/condominios/${condominioId}/muro`);
}

export async function editarPublicacion(id: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const { administradoraId } = await requireAdministradora();
  const datos = leer(formData);
  if (!datos.success) return erroresDe(datos.error);
  const pub = await db.publicacion.findFirst({ where: { id, administradoraId } });
  if (!pub) return { mensaje: "Publicación no encontrada." };
  await db.publicacion.update({ where: { id }, data: datos.data });
  revalidatePath(`/condominios/${pub.condominioId}`, "layout");
  redirect(`/condominios/${pub.condominioId}/muro/${id}`);
}

export async function eliminarPublicacion(id: string, volverAlMuro = false) {
  const { administradoraId } = await requireAdministradora();
  const pub = await db.publicacion.findFirst({ where: { id, administradoraId } });
  if (!pub) return;
  await db.publicacion.delete({ where: { id } });
  revalidatePath(`/condominios/${pub.condominioId}`, "layout");
  if (volverAlMuro) redirect(`/condominios/${pub.condominioId}/muro`);
}
