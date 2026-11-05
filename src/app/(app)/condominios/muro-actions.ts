"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { puedeVerPropiedad, requireAdministradora } from "@/lib/auth";
import { aTexto, erroresDe, type EstadoForm } from "@/lib/forms";
import { registrar } from "@/lib/registro";

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
  if (!puedeVerPropiedad(usuario, condominioId) || !(await db.condominio.findFirst({ where: { id: condominioId, administradoraId } }))) {
    return { mensaje: "Propiedad no encontrada." };
  }
  await db.publicacion.create({ data: { ...datos.data, condominioId, administradoraId, autor: usuario.nombre } });
  await registrar(usuario, "Publicó en el muro", datos.data.titulo, condominioId);
  revalidatePath(`/condominios/${condominioId}`, "layout");
  redirect(`/condominios/${condominioId}/muro`);
}

export async function editarPublicacion(id: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const { usuario, administradoraId } = await requireAdministradora();
  const datos = leer(formData);
  if (!datos.success) return erroresDe(datos.error);
  const pub = await db.publicacion.findFirst({ where: { id, administradoraId } });
  if (!pub || !puedeVerPropiedad(usuario, pub.condominioId)) return { mensaje: "Publicación no encontrada." };
  await db.publicacion.update({ where: { id }, data: datos.data });
  await registrar(usuario, "Editó una publicación", datos.data.titulo, pub.condominioId);
  revalidatePath(`/condominios/${pub.condominioId}`, "layout");
  redirect(`/condominios/${pub.condominioId}/muro/${id}`);
}

export async function eliminarPublicacion(id: string, volverAlMuro = false) {
  const { usuario, administradoraId } = await requireAdministradora();
  const pub = await db.publicacion.findFirst({ where: { id, administradoraId } });
  if (!pub || !puedeVerPropiedad(usuario, pub.condominioId)) return;
  await db.publicacion.delete({ where: { id } });
  await registrar(usuario, "Borró una publicación", pub.titulo, pub.condominioId);
  revalidatePath(`/condominios/${pub.condominioId}`, "layout");
  if (volverAlMuro) redirect(`/condominios/${pub.condominioId}/muro`);
}
