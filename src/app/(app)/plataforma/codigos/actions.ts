"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermiso } from "@/lib/auth";
import { crearCodigoRegistro, nuevoEnlaceVerificacion } from "@/lib/cuentas";
import { db } from "@/lib/db";
import { aNumero, aTexto, erroresDe, type EstadoForm } from "@/lib/forms";
import { registrar } from "@/lib/registro";
import { CorreoSchema } from "@/lib/usuarios";

// PILOTO-001: la plataforma (Óscar) controla quién puede crear cuentas de administración.

const CodigoSchema = z.object({
  etiqueta: z.string({ error: "Escribe para quién es." }).min(2, { error: "Escribe para quién es." }).max(80),
  correo: CorreoSchema.optional(),
  dias: z.number({ error: "Entre 1 y 60 días." }).int().min(1, { error: "Entre 1 y 60 días." }).max(60, { error: "Entre 1 y 60 días." }),
  usos: z.number({ error: "Entre 1 y 20 usos." }).int().min(1, { error: "Entre 1 y 20 usos." }).max(20, { error: "Entre 1 y 20 usos." }),
});

export type EstadoCodigo = EstadoForm & { codigo?: string; enlace?: string };

export async function crearCodigo(_: EstadoCodigo, formData: FormData): Promise<EstadoCodigo> {
  const autor = await requirePermiso("plataforma");
  const d = CodigoSchema.safeParse({
    etiqueta: aTexto(formData.get("etiqueta")),
    correo: aTexto(formData.get("correo")),
    dias: aNumero(formData.get("dias")) ?? 7,
    usos: aNumero(formData.get("usos")) ?? 1,
  });
  if (!d.success) return erroresDe(d.error);
  const r = await crearCodigoRegistro(autor, { ...d.data, correo: d.data.correo ?? null });
  revalidatePath("/plataforma/codigos");
  return { ok: true, ...r };
}

export async function anularCodigo(id: string) {
  const autor = await requirePermiso("plataforma");
  const c = await db.codigoRegistro.updateMany({ where: { id, anuladoEn: null }, data: { anuladoEn: new Date() } });
  if (c.count) await registrar(autor, "Anuló un código de acceso para administradores", id);
  revalidatePath("/plataforma/codigos");
}

/** Enlace de confirmación de correo de una cuenta nueva, para entregarlo a mano si el correo no llega. */
export async function enlaceVerificacionPlataforma(usuarioId: string): Promise<string | null> {
  const autor = await requirePermiso("plataforma");
  const u = await db.usuario.findFirst({
    where: { id: usuarioId, correoVerificadoEn: null, activo: true, rol: { not: "SUPERADMIN" } },
    select: { id: true, nombre: true, correo: true },
  });
  if (!u) return null;
  const enlace = await nuevoEnlaceVerificacion(u.id);
  await registrar(autor, "Generó un enlace para confirmar el correo de una cuenta", `${u.nombre} (${u.correo})`);
  return enlace;
}
