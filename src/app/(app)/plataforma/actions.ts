"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUsuario } from "@/lib/auth";
import { aTexto, erroresDe, type EstadoForm } from "@/lib/forms";
import { ClaveSchema, CorreoSchema } from "@/lib/usuarios";

const AdministradoraSchema = z.object({
  nombre: z.string({ error: "Ingresa el nombre." }).min(2, { error: "Ingresa el nombre." }),
  pais: z.string().length(2, { error: "Código de 2 letras, ej. CL." }).toUpperCase(),
  moneda: z.string().length(3, { error: "Código de 3 letras, ej. CLP." }).toUpperCase(),
  adminNombre: z.string({ error: "Ingresa el nombre." }).min(2, { error: "Ingresa el nombre." }),
  adminCorreo: CorreoSchema,
  adminClave: ClaveSchema,
});

export async function crearAdministradora(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  await requireUsuario(["SUPERADMIN"]);
  const datos = AdministradoraSchema.safeParse({
    nombre: aTexto(formData.get("nombre")),
    pais: aTexto(formData.get("pais")) ?? "CL",
    moneda: aTexto(formData.get("moneda")) ?? "CLP",
    adminNombre: aTexto(formData.get("adminNombre")),
    adminCorreo: aTexto(formData.get("adminCorreo")),
    adminClave: aTexto(formData.get("adminClave")),
  });
  if (!datos.success) return erroresDe(datos.error);
  const d = datos.data;

  if (await db.usuario.findUnique({ where: { correo: d.adminCorreo } })) {
    return { errores: { adminCorreo: ["Ese correo ya tiene una cuenta."] } };
  }

  await db.administradora.create({
    data: {
      nombre: d.nombre,
      pais: d.pais,
      moneda: d.moneda,
      usuarios: {
        create: {
          nombre: d.adminNombre,
          correo: d.adminCorreo,
          claveHash: await bcrypt.hash(d.adminClave, 10),
          rol: "ADMINISTRADOR",
        },
      },
    },
  });
  revalidatePath("/plataforma");
  return { ok: true, mensaje: `Administradora ${d.nombre} creada.` };
}
