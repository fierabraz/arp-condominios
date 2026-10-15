"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdministradora } from "@/lib/auth";
import { aTexto, erroresDe, type EstadoForm } from "@/lib/forms";

const PersonaSchema = z.object({
  nombre: z.string({ error: "Ingresa el nombre." }).min(2, { error: "Ingresa el nombre." }),
  documento: z.string().optional(),
  correo: z.email({ error: "Correo no válido." }).optional(),
  telefono: z.string().optional(),
});

function leerPersona(formData: FormData) {
  return PersonaSchema.safeParse({
    nombre: aTexto(formData.get("nombre")),
    documento: aTexto(formData.get("documento")),
    correo: aTexto(formData.get("correo"))?.toLowerCase(),
    telefono: aTexto(formData.get("telefono")),
  });
}

export async function crearPersona(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const { administradoraId } = await requireAdministradora();
  const datos = leerPersona(formData);
  if (!datos.success) return erroresDe(datos.error);
  await db.persona.create({ data: { ...datos.data, administradoraId } });
  revalidatePath("/personas");
  return { ok: true, mensaje: `${datos.data.nombre} registrado.` };
}

export async function editarPersona(id: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const { administradoraId } = await requireAdministradora();
  const datos = leerPersona(formData);
  if (!datos.success) return erroresDe(datos.error);
  const { count } = await db.persona.updateMany({ where: { id, administradoraId }, data: datos.data });
  if (count === 0) return { mensaje: "Persona no encontrada." };
  revalidatePath("/personas");
  return { ok: true, mensaje: "Cambios guardados." };
}

export async function eliminarPersona(id: string) {
  const { administradoraId } = await requireAdministradora();
  await db.persona.deleteMany({ where: { id, administradoraId } });
  revalidatePath("/personas");
  redirect("/personas");
}
