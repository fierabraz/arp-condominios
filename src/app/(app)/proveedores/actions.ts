"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdministradora } from "@/lib/auth";
import { aTexto, erroresDe, type EstadoForm } from "@/lib/forms";

const ProveedorSchema = z.object({
  nombre: z.string({ error: "Ingresa el nombre." }).min(2, { error: "Ingresa el nombre." }),
  rut: z.string().optional(),
  rubro: z.string().optional(),
  contacto: z.string().optional(),
  telefono: z.string().optional(),
  correo: z.email({ error: "Correo no válido." }).optional(),
});

export async function crearProveedor(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const { administradoraId } = await requireAdministradora();
  const datos = ProveedorSchema.safeParse({
    nombre: aTexto(formData.get("nombre")),
    rut: aTexto(formData.get("rut")),
    rubro: aTexto(formData.get("rubro")),
    contacto: aTexto(formData.get("contacto")),
    telefono: aTexto(formData.get("telefono")),
    correo: aTexto(formData.get("correo"))?.toLowerCase(),
  });
  if (!datos.success) return erroresDe(datos.error);
  const existe = await db.proveedor.findUnique({
    where: { administradoraId_nombre: { administradoraId, nombre: datos.data.nombre } },
  });
  if (existe) return { errores: { nombre: ["Ya tienes un proveedor con ese nombre."] } };
  await db.proveedor.create({ data: { ...datos.data, administradoraId } });
  revalidatePath("/proveedores");
  return { ok: true, mensaje: `${datos.data.nombre} agregado al catálogo.` };
}

export async function eliminarProveedor(id: string) {
  const { administradoraId } = await requireAdministradora();
  // Los gastos guardan el nombre del proveedor como texto, así que no se pierden.
  await db.proveedor.deleteMany({ where: { id, administradoraId } });
  revalidatePath("/proveedores");
}
