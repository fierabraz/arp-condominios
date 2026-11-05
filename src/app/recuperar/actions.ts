"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { enviarCorreo, escaparHtml } from "@/lib/correo";
import { aTexto, erroresDe, type EstadoForm } from "@/lib/forms";
import { anotarIntento, ipCliente } from "@/lib/intentos";
import { MARCA } from "@/lib/marca";
import { canjearToken, crearToken, MINUTOS_VALIDEZ, SOLICITUDES_POR_HORA } from "@/lib/recuperacion";
import { registrar } from "@/lib/registro";
import { origenDelSitio } from "@/lib/sitio";
import { LOGIN, tipoDeRol } from "@/lib/session";
import { ClaveNuevaSchema, CorreoSchema } from "@/lib/usuarios";

const RESPUESTA =
  "Si el correo está registrado, te enviamos un enlace para crear una contraseña nueva. Revisa tu bandeja de entrada y la carpeta de spam.";

export async function solicitarRecuperacion(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const datos = CorreoSchema.safeParse(aTexto(formData.get("correo")));
  if (!datos.success) return { errores: { correo: ["Ingresa un correo válido."] } };

  // La respuesta es siempre la misma, exista o no la cuenta, para no revelar qué correos están registrados.
  const usuario = await db.usuario.findUnique({ where: { correo: datos.data } });
  if (!usuario || !usuario.activo) return { ok: true, mensaje: RESPUESTA };
  const recientes = await db.tokenRecuperacion.count({
    where: { usuarioId: usuario.id, tipo: "RECUPERACION", creadoEn: { gte: new Date(Date.now() - 3_600_000) } },
  });
  if (recientes >= SOLICITUDES_POR_HORA) return { ok: true, mensaje: RESPUESTA };

  const token = await crearToken(usuario.id);
  const enlace = `${await origenDelSitio()}/recuperar/${token}`;
  const nombre = usuario.nombre.split(" ")[0];
  await enviarCorreo({
    para: usuario.correo,
    asunto: `Crea una contraseña nueva en ${MARCA.nombre}`,
    texto: `Hola, ${nombre}:\n\nPediste crear una contraseña nueva. Abre este enlace (sirve una sola vez y durante ${MINUTOS_VALIDEZ} minutos):\n\n${enlace}\n\nSi no lo pediste, ignora este correo: tu contraseña actual sigue funcionando.`,
    html: `<p>Hola, ${escaparHtml(nombre)}:</p><p>Pediste crear una contraseña nueva. Usa este botón (sirve una sola vez y durante ${MINUTOS_VALIDEZ} minutos):</p><p><a href="${enlace}" style="display:inline-block;padding:12px 20px;background:#00666A;color:#fff;border-radius:12px;text-decoration:none;font-weight:600">Crear contraseña nueva</a></p><p>Si no lo pediste, ignora este correo: tu contraseña actual sigue funcionando.</p>`,
  });
  return { ok: true, mensaje: RESPUESTA };
}

export async function crearClaveNueva(token: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const datos = ClaveNuevaSchema.safeParse({ nueva: aTexto(formData.get("nueva")), repetir: aTexto(formData.get("repetir")) });
  if (!datos.success) return erroresDe(datos.error);
  const usuario = await canjearToken(token, "RECUPERACION", datos.data.nueva);
  if (!usuario) return { mensaje: "El enlace ya se usó o venció. Pide uno nuevo." };
  // Un cambio de contraseña reinicia el conteo de intentos fallidos.
  await anotarIntento(usuario.correo, await ipCliente(), true);
  await registrar(usuario, "Creó una contraseña nueva con el enlace de recuperación", usuario.correo);
  redirect(`${LOGIN[tipoDeRol(usuario.rol)]}?listo=1`);
}
