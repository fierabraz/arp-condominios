"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { enviarCorreo, escaparHtml } from "@/lib/correo";
import { aTexto, erroresDe, type EstadoForm } from "@/lib/forms";
import { anotarIntento, ipCliente } from "@/lib/intentos";
import { MARCA } from "@/lib/marca";
import { crearToken, hashToken, MINUTOS_VALIDEZ, SOLICITUDES_POR_HORA, tokenVigente } from "@/lib/recuperacion";
import { registrar } from "@/lib/registro";
import { LOGIN, tipoDeRol } from "@/lib/session";
import { ClaveSchema, CorreoSchema } from "@/lib/usuarios";

/**
 * Dirección del sitio para el enlace del correo. En Vercel sale de sus variables (no del
 * encabezado Host, que quien hace la petición podría falsear para robar el enlace).
 */
async function origenDelSitio() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  const vercel = process.env.VERCEL_BRANCH_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return `http://${(await headers()).get("host") ?? "localhost:3000"}`;
}

const RESPUESTA =
  "Si el correo está registrado, te enviamos un enlace para crear una contraseña nueva. Revisa tu bandeja de entrada y la carpeta de spam.";

export async function solicitarRecuperacion(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const datos = CorreoSchema.safeParse(aTexto(formData.get("correo")));
  if (!datos.success) return { errores: { correo: ["Ingresa un correo válido."] } };

  // La respuesta es siempre la misma, exista o no la cuenta, para no revelar qué correos están registrados.
  const usuario = await db.usuario.findUnique({ where: { correo: datos.data } });
  if (!usuario || !usuario.activo) return { ok: true, mensaje: RESPUESTA };
  const recientes = await db.tokenRecuperacion.count({
    where: { usuarioId: usuario.id, creadoEn: { gte: new Date(Date.now() - 3_600_000) } },
  });
  if (recientes >= SOLICITUDES_POR_HORA) return { ok: true, mensaje: RESPUESTA };

  const token = await crearToken(usuario.id);
  const enlace = `${await origenDelSitio()}/recuperar/${token}`;
  const nombre = usuario.nombre.split(" ")[0];
  await enviarCorreo({
    para: usuario.correo,
    asunto: `Crea una contraseña nueva en ${MARCA.nombre}`,
    texto: `Hola, ${nombre}:\n\nPediste crear una contraseña nueva. Abre este enlace (sirve una sola vez y durante ${MINUTOS_VALIDEZ} minutos):\n\n${enlace}\n\nSi no lo pediste, ignora este correo: tu contraseña actual sigue funcionando.`,
    html: `<p>Hola, ${escaparHtml(nombre)}:</p><p>Pediste crear una contraseña nueva. Usa este botón (sirve una sola vez y durante ${MINUTOS_VALIDEZ} minutos):</p><p><a href="${enlace}" style="display:inline-block;padding:12px 20px;background:#0e7c6b;color:#fff;border-radius:12px;text-decoration:none;font-weight:600">Crear contraseña nueva</a></p><p>Si no lo pediste, ignora este correo: tu contraseña actual sigue funcionando.</p>`,
  });
  return { ok: true, mensaje: RESPUESTA };
}

const NuevaSchema = z
  .object({ nueva: ClaveSchema, repetir: z.string({ error: "Repite la contraseña." }) })
  .refine((d) => d.nueva === d.repetir, { error: "Las contraseñas no coinciden.", path: ["repetir"] });

export async function crearClaveNueva(token: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const datos = NuevaSchema.safeParse({ nueva: aTexto(formData.get("nueva")), repetir: aTexto(formData.get("repetir")) });
  if (!datos.success) return erroresDe(datos.error);
  const t = await tokenVigente(token);
  if (!t) return { mensaje: "El enlace ya se usó o venció. Pide uno nuevo." };

  const ahora = new Date();
  // Marcar el token como usado solo si nadie lo usó en paralelo.
  const { count } = await db.tokenRecuperacion.updateMany({
    where: { tokenHash: hashToken(token), usadoEn: null },
    data: { usadoEn: ahora },
  });
  if (count === 0) return { mensaje: "El enlace ya se usó o venció. Pide uno nuevo." };
  await db.$transaction([
    // claveActualizadaEn cierra las sesiones que estuvieran abiertas con la contraseña anterior.
    db.usuario.update({
      where: { id: t.usuarioId },
      data: { claveHash: await bcrypt.hash(datos.data.nueva, 10), claveActualizadaEn: ahora },
    }),
    // Los demás enlaces pendientes de esa cuenta dejan de servir.
    db.tokenRecuperacion.updateMany({ where: { usuarioId: t.usuarioId, usadoEn: null }, data: { usadoEn: ahora } }),
  ]);
  // Un cambio de contraseña reinicia el conteo de intentos fallidos.
  await anotarIntento(t.usuario.correo, await ipCliente(), true);
  await registrar(t.usuario, "Creó una contraseña nueva con el enlace de recuperación", t.usuario.correo);
  redirect(`${LOGIN[tipoDeRol(t.usuario.rol)]}?listo=1`);
}
