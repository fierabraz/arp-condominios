import "server-only";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import type { UsuarioActual } from "@/lib/auth";
import { enviarCorreo, escaparHtml, smtpConfigurado } from "@/lib/correo";
import { enlaceWhatsapp, estadoAcceso, mensajeInvitacion, puedeInvitar } from "@/lib/invitacion-estado";
import { MARCA } from "@/lib/marca";
import { crearToken, DIAS_INVITACION } from "@/lib/recuperacion";
import { registrar } from "@/lib/registro";
import { origenDelSitio } from "@/lib/sitio";

export type ResultadoInvitacion =
  | {
      ok: true;
      personaId: string;
      nombre: string;
      correo: string;
      enlace: string;
      whatsapp: string;
      mensaje: string;
      /** Cómo salió el correo: ENVIADO, o SIMULADO si todavía no hay servidor de correo. */
      correoEstado: "ENVIADO" | "SIMULADO" | "ERROR";
    }
  | { ok: false; personaId: string; nombre: string; error: string };

/** Personas vinculadas a la propiedad, con su cuenta y sus invitaciones, para calcular su estado. */
export async function personasDePropiedad(condominioId: string, administradoraId: string) {
  return db.persona.findMany({
    where: { administradoraId, unidades: { some: { unidad: { condominioId } } } },
    orderBy: { nombre: "asc" },
    include: {
      unidades: { where: { unidad: { condominioId } }, include: { unidad: { select: { numero: true } } } },
      usuario: {
        select: {
          id: true,
          rol: true,
          activo: true,
          claveActualizadaEn: true,
          ultimoIngresoEn: true,
          tokensRecuperacion: { where: { tipo: "INVITACION" }, select: { expiraEn: true, usadoEn: true } },
        },
      },
    },
  });
}

export async function estadoDePersona(personaId: string, administradoraId: string) {
  const p = await db.persona.findFirst({
    where: { id: personaId, administradoraId },
    include: {
      usuario: {
        select: {
          rol: true,
          activo: true,
          claveActualizadaEn: true,
          ultimoIngresoEn: true,
          tokensRecuperacion: { where: { tipo: "INVITACION" }, select: { expiraEn: true, usadoEn: true } },
        },
      },
    },
  });
  if (!p) return null;
  return estadoAcceso(p.correo, p.usuario && { ...p.usuario, invitaciones: p.usuario.tokensRecuperacion });
}

/**
 * Crea (o renueva) la invitación de una persona: su cuenta de residente queda creada sin
 * contraseña usable, y el enlace le permite crearla. Se envía por correo si hay servidor
 * de correo; en cualquier caso se devuelve el enlace para mandarlo por WhatsApp.
 */
export async function invitarPersona(
  autor: UsuarioActual,
  administradoraId: string,
  personaId: string,
  condominioId?: string,
): Promise<ResultadoInvitacion> {
  const persona = await db.persona.findFirst({
    where: { id: personaId, administradoraId },
    include: {
      unidades: { include: { unidad: { select: { condominioId: true, condominio: { select: { nombre: true } } } } } },
      usuario: {
        select: {
          id: true,
          rol: true,
          activo: true,
          correo: true,
          claveActualizadaEn: true,
          ultimoIngresoEn: true,
          tokensRecuperacion: { where: { tipo: "INVITACION" }, select: { expiraEn: true, usadoEn: true } },
        },
      },
    },
  });
  if (!persona) return { ok: false, personaId, nombre: "", error: "Persona no encontrada." };
  const falla = (error: string): ResultadoInvitacion => ({ ok: false, personaId, nombre: persona.nombre, error });
  if (!persona.correo) return falla("Le falta el correo. Agrégalo en sus datos para poder invitarla.");
  if (persona.unidades.length === 0) return falla("No está vinculada a ninguna unidad, así que no vería nada en la app.");

  const estado = estadoAcceso(
    persona.correo,
    persona.usuario && { ...persona.usuario, invitaciones: persona.usuario.tokensRecuperacion },
  );
  if (estado === "ACTIVA") return falla("Ya tiene acceso. Si olvidó su contraseña, puede recuperarla desde el ingreso de residentes.");
  if (estado === "DESACTIVADA") return falla("Su cuenta está desactivada.");
  if (!puedeInvitar(estado)) return falla("No se puede invitar.");

  const otra = await db.usuario.findUnique({ where: { correo: persona.correo }, select: { id: true } });
  if (otra && otra.id !== persona.usuario?.id) {
    return falla(`El correo ${persona.correo} ya lo usa otra cuenta. Usa un correo distinto para esta persona.`);
  }

  const ahora = new Date();
  let usuarioId = persona.usuario?.id;
  if (!usuarioId) {
    // Contraseña aleatoria que nadie conoce: la cuenta no sirve hasta que la persona cree la suya.
    const claveHash = await bcrypt.hash(randomBytes(24).toString("base64url"), 10);
    const creado = await db.usuario.create({
      data: { nombre: persona.nombre, correo: persona.correo, rol: "RESIDENTE", administradoraId, personaId, claveHash },
    });
    usuarioId = creado.id;
  } else {
    // Si se corrigió el correo o el nombre antes de que acepte, la cuenta se pone al día.
    await db.usuario.update({ where: { id: usuarioId }, data: { nombre: persona.nombre, correo: persona.correo } });
  }
  // Solo sirve el último enlace enviado.
  await db.tokenRecuperacion.updateMany({
    where: { usuarioId, tipo: "INVITACION", usadoEn: null },
    data: { usadoEn: ahora },
  });
  const token = await crearToken(usuarioId, "INVITACION");
  const enlace = `${await origenDelSitio()}/invitacion/${token}`;

  const propiedad =
    persona.unidades.find((v) => v.unidad.condominioId === condominioId)?.unidad.condominio.nombre ??
    persona.unidades[0].unidad.condominio.nombre;
  const mensaje = mensajeInvitacion(persona.nombre, propiedad, enlace, DIAS_INVITACION);
  const primer = persona.nombre.split(" ")[0];
  const envio = await enviarCorreo({
    para: persona.correo,
    asunto: `Te invitamos a la app de ${propiedad}`,
    texto: `Hola, ${primer}:\n\nTe invitamos a ${MARCA.nombre}, la app de ${propiedad}, donde puedes ver tus gastos comunes, tus pagos, los avisos y las votaciones.\n\nCrea tu contraseña con este enlace (sirve una sola vez y durante ${DIAS_INVITACION} días):\n\n${enlace}\n\nTu usuario es este correo: ${persona.correo}`,
    html: `<p>Hola, ${escaparHtml(primer)}:</p><p>Te invitamos a ${escaparHtml(MARCA.nombre)}, la app de <strong>${escaparHtml(propiedad)}</strong>, donde puedes ver tus gastos comunes, tus pagos, los avisos y las votaciones.</p><p><a href="${enlace}" style="display:inline-block;padding:12px 20px;background:#0e7c6b;color:#fff;border-radius:12px;text-decoration:none;font-weight:600">Crear mi contraseña</a></p><p>El enlace sirve una sola vez y durante ${DIAS_INVITACION} días. Tu usuario es este correo: ${escaparHtml(persona.correo)}</p>`,
  });
  await registrar(
    autor,
    estado === "SIN_CUENTA" ? "Invitó a una persona a la app" : "Renovó la invitación a la app",
    `${persona.nombre} (${persona.correo})${smtpConfigurado() ? "" : ", sin servidor de correo: enlace para copiar"}`,
    condominioId,
  );
  return {
    ok: true,
    personaId,
    nombre: persona.nombre,
    correo: persona.correo,
    enlace,
    mensaje,
    whatsapp: enlaceWhatsapp(persona.telefono, mensaje),
    correoEstado: envio.estado,
  };
}
