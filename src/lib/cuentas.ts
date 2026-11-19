import "server-only";
// PILOTO-001: creación de cuentas. Usa el mismo sistema de usuarios de siempre (Usuario, sesiones,
// enlaces de un uso en TokenRecuperacion); aquí solo se agregan los caminos para que cada persona
// cree su propia cuenta y para vincularla con su comunidad de forma segura.
//
// Reglas:
// - Registrarse nunca da privilegios de plataforma ni acceso a comunidades de otros.
// - Un administrador solo se registra con un código de acceso que entrega la plataforma; queda
//   como principal de una administradora nueva y vacía.
// - Un residente se registra sin acceso a nada. Solo la administración de la comunidad lo vincula
//   con una unidad, al aprobar su solicitud (o al invitarlo desde su ficha).
// - Las cuentas creadas por la propia persona no entran hasta confirmar su correo.

import { randomBytes, randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import type { UsuarioActual } from "@/lib/auth";
import { enviarCorreo, escaparHtml } from "@/lib/correo";
import { operaAdministracion, type Estado } from "@/lib/configuracion";
import { hoyDia } from "@/lib/estructura";
import { MARCA } from "@/lib/marca";
import { puede, esPermisoAsignable } from "@/lib/permisos";
import { crearToken, hashToken, HORAS_VERIFICACION, SOLICITUDES_POR_HORA, DIAS_INVITACION } from "@/lib/recuperacion";
import { registrar, registrarEn } from "@/lib/registro";
import { origenDelSitio } from "@/lib/sitio";
import { crearVinculo } from "@/lib/vinculos-servicio";
import {
  estadoCodigo,
  MAX_SOLICITUDES_PENDIENTES,
  MENSAJE_CODIGO,
  normalizarCodigo,
  RELACIONES,
  vinculosDeRelacion,
  type Cargo,
  type RelacionDeclarada,
} from "@/lib/cuentas-reglas";

// Letras y números sin los que se confunden al dictarlos o escribirlos (0/O, 1/I/L).
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function bloques(cantidad: number, largo = 4) {
  return Array.from({ length: cantidad }, () =>
    Array.from({ length: largo }, () => ALFABETO[randomInt(ALFABETO.length)]).join(""),
  ).join("-");
}

/** Código de acceso para registrar administradores (unos 59 bits): CV-XXXX-XXXX-XXXX. */
export const nuevoCodigoRegistro = () => `CV-${bloques(3)}`;

/** Código para que los residentes pidan unirse a una comunidad: XXXX-XXXX. */
export const nuevoCodigoComunidad = () => bloques(2);

const boton = (href: string, texto: string) =>
  `<p><a href="${href}" style="display:inline-block;padding:12px 20px;background:#00666A;color:#fff;border-radius:12px;text-decoration:none;font-weight:600">${escaparHtml(texto)}</a></p>`;

const primerNombre = (nombre: string) => nombre.trim().split(/\s+/)[0] ?? nombre;

export type ResultadoEnvio = "ENVIADO" | "SIMULADO" | "ERROR" | "LIMITE";

// ---------------------------------------------------------------------------
// Verificación de correo

/** Crea un enlace de verificación nuevo (los anteriores dejan de servir) y devuelve el enlace. */
export async function nuevoEnlaceVerificacion(usuarioId: string) {
  await db.tokenRecuperacion.updateMany({
    where: { usuarioId, tipo: "VERIFICACION", usadoEn: null },
    data: { usadoEn: new Date() },
  });
  const token = await crearToken(usuarioId, "VERIFICACION");
  return `${await origenDelSitio()}/verificar/${token}`;
}

/** Envía el correo para confirmar la cuenta. Máximo SOLICITUDES_POR_HORA por hora y cuenta. */
export async function enviarVerificacion(usuario: { id: string; nombre: string; correo: string }): Promise<ResultadoEnvio> {
  const recientes = await db.tokenRecuperacion.count({
    where: { usuarioId: usuario.id, tipo: "VERIFICACION", creadoEn: { gte: new Date(Date.now() - 3_600_000) } },
  });
  if (recientes >= SOLICITUDES_POR_HORA) return "LIMITE";
  const enlace = await nuevoEnlaceVerificacion(usuario.id);
  const nombre = primerNombre(usuario.nombre);
  const envio = await enviarCorreo({
    para: usuario.correo,
    asunto: `Confirma tu correo en ${MARCA.nombre}`,
    texto: `Hola, ${nombre}:\n\nPara terminar de crear tu cuenta en ${MARCA.nombre}, confirma tu correo con este enlace (sirve una sola vez y durante ${HORAS_VERIFICACION} horas):\n\n${enlace}\n\nSi no creaste una cuenta, ignora este correo: sin confirmar, nadie puede usarla.`,
    html: `<p>Hola, ${escaparHtml(nombre)}:</p><p>Para terminar de crear tu cuenta en ${escaparHtml(MARCA.nombre)}, confirma tu correo (el enlace sirve una sola vez y durante ${HORAS_VERIFICACION} horas):</p>${boton(enlace, "Confirmar mi correo")}<p>Si no creaste una cuenta, ignora este correo: sin confirmar, nadie puede usarla.</p>`,
  });
  return envio.estado;
}

/** Aviso a quien ya tiene cuenta cuando alguien intenta registrarse otra vez con su correo. */
async function avisarCuentaExistente(usuario: { id: string; nombre: string; correo: string; correoVerificadoEn: Date | null }) {
  // Cuenta propia todavía sin confirmar: se reenvía la verificación.
  if (!usuario.correoVerificadoEn) return enviarVerificacion(usuario);
  const origen = await origenDelSitio();
  const nombre = primerNombre(usuario.nombre);
  const envio = await enviarCorreo({
    para: usuario.correo,
    asunto: `Ya tienes una cuenta en ${MARCA.nombre}`,
    texto: `Hola, ${nombre}:\n\nAlguien (quizás tú) intentó crear una cuenta nueva con este correo, pero ya tienes una. Ingresa en ${origen}/login o, si no recuerdas tu contraseña, recupérala en ${origen}/recuperar.\n\nSi no fuiste tú, no tienes que hacer nada: tu cuenta sigue igual.`,
    html: `<p>Hola, ${escaparHtml(nombre)}:</p><p>Alguien (quizás tú) intentó crear una cuenta nueva con este correo, pero ya tienes una.</p>${boton(`${origen}/recuperar`, "Recuperar mi contraseña")}<p>Si no fuiste tú, no tienes que hacer nada: tu cuenta sigue igual.</p>`,
  });
  return envio.estado;
}

// ---------------------------------------------------------------------------
// Códigos de acceso para administradores (los crea la plataforma)

export async function crearCodigoRegistro(
  autor: UsuarioActual,
  d: { etiqueta: string; correo: string | null; dias: number; usos: number },
) {
  const codigo = nuevoCodigoRegistro();
  await db.codigoRegistro.create({
    data: {
      etiqueta: d.etiqueta,
      correo: d.correo,
      tokenHash: hashToken(codigo),
      usosMaximos: d.usos,
      expiraEn: new Date(Date.now() + d.dias * 86_400_000),
      creadoPor: autor.nombre,
    },
  });
  await registrar(autor, "Creó un código de acceso para administradores", `${d.etiqueta}${d.correo ? ` (${d.correo})` : ""}`);
  return { codigo, enlace: `${await origenDelSitio()}/crear-cuenta/administracion?codigo=${encodeURIComponent(codigo)}` };
}

/** Busca un código de acceso por su texto (solo se guarda su resumen). */
export async function buscarCodigoRegistro(codigo: string) {
  const normal = normalizarCodigo(codigo);
  if (!normal) return null;
  return db.codigoRegistro.findUnique({ where: { tokenHash: hashToken(normal) } });
}

// ---------------------------------------------------------------------------
// Registro

export type ResultadoRegistro =
  | { ok: true; correo: string; envio: ResultadoEnvio }
  | { ok: false; mensaje?: string; errores?: Record<string, string[]> };

type DatosCuenta = { nombre: string; correo: string; telefono: string | null; clave: string };

/**
 * Registro de un administrador con código de acceso. Crea una administradora nueva (vacía) y su
 * administrador principal, sin acceso a nada más. La cuenta no entra hasta confirmar el correo.
 */
export async function registrarAdministrador(d: DatosCuenta & { codigo: string; administracion: string | null }): Promise<ResultadoRegistro> {
  const codigo = await buscarCodigoRegistro(d.codigo);
  if (!codigo) return { ok: false, errores: { codigo: ["No encontramos ese código de acceso. Revísalo o pide uno a Convive."] } };
  const estado = estadoCodigo(codigo, d.correo, new Date());
  if (estado !== "VALIDO") return { ok: false, errores: { [estado === "OTRO_CORREO" ? "correo" : "codigo"]: [MENSAJE_CODIGO[estado]] } };

  // Si el correo ya tiene cuenta, la respuesta es la misma que si no (no se revela qué correos
  // existen) y el código no se gasta.
  const existente = await db.usuario.findUnique({ where: { correo: d.correo } });
  if (existente) return { ok: true, correo: d.correo, envio: await avisarCuentaExistente(existente) };

  const claveHash = await bcrypt.hash(d.clave, 10);
  const ahora = new Date();
  let usuario;
  try {
    usuario = await db.$transaction(async (tx) => {
      // Gasta un uso del código solo si sigue vigente (dos registros a la vez no lo pasan del máximo).
      const usados = await tx.$executeRaw`
        UPDATE "CodigoRegistro" SET "usos" = "usos" + 1
        WHERE id = ${codigo.id} AND "anuladoEn" IS NULL AND "expiraEn" > ${ahora} AND "usos" < "usosMaximos"`;
      if (usados === 0) throw new ErrorCuenta(MENSAJE_CODIGO.AGOTADO);
      const adm = await tx.administradora.create({
        data: { nombre: d.administracion || `Administración ${d.nombre}` },
      });
      return tx.usuario.create({
        data: {
          administradoraId: adm.id,
          nombre: d.nombre,
          correo: d.correo,
          telefono: d.telefono,
          claveHash,
          rol: "ADMINISTRADOR",
          // Principal de SU administradora (que está vacía): ve solo lo que él mismo cree.
          accesoTodas: true,
          correoVerificadoEn: null,
          codigoRegistroId: codigo.id,
        },
      });
    });
  } catch (e) {
    if (e instanceof ErrorCuenta) return { ok: false, errores: { codigo: [e.message] } };
    if ((e as { code?: string }).code === "P2002") return { ok: true, correo: d.correo, envio: "ENVIADO" };
    throw e;
  }
  await registrar(usuario, "Creó su cuenta de administración con código de acceso", `${usuario.nombre} (${usuario.correo}), código "${codigo.etiqueta}"`);
  return { ok: true, correo: d.correo, envio: await enviarVerificacion(usuario) };
}

/**
 * Registro de un residente o propietario. La cuenta nace sin acceso a ninguna unidad; si trae el
 * código de su comunidad, queda una solicitud que la administración debe aprobar.
 */
export async function registrarResidente(
  d: DatosCuenta & { solicitud: { condominioId: string; administradoraId: string; unidadTexto: string; relacion: RelacionDeclarada; mensaje: string | null } | null },
): Promise<ResultadoRegistro> {
  const existente = await db.usuario.findUnique({ where: { correo: d.correo } });
  if (existente) return { ok: true, correo: d.correo, envio: await avisarCuentaExistente(existente) };

  const claveHash = await bcrypt.hash(d.clave, 10);
  let usuario;
  try {
    usuario = await db.usuario.create({
      data: {
        nombre: d.nombre,
        correo: d.correo,
        telefono: d.telefono,
        claveHash,
        rol: "RESIDENTE",
        administradoraId: null,
        personaId: null,
        correoVerificadoEn: null,
        ...(d.solicitud ? { solicitudesVinculo: { create: d.solicitud } } : {}),
      },
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { ok: true, correo: d.correo, envio: "ENVIADO" };
    throw e;
  }
  return { ok: true, correo: d.correo, envio: await enviarVerificacion(usuario) };
}

/** Comunidad por su código de incorporación, o null. */
export async function comunidadPorCodigo(codigo: string) {
  const normal = normalizarCodigo(codigo);
  if (normal.length < 8) return null;
  return db.condominio.findUnique({
    where: { codigoIncorporacion: normal },
    select: { id: true, nombre: true, administradoraId: true, estado: true },
  });
}

// ---------------------------------------------------------------------------
// Solicitudes de vínculo

class ErrorCuenta extends Error {}

/** Un residente con sesión pide vincularse con una unidad de una comunidad (por su código). */
export async function crearSolicitud(
  usuario: UsuarioActual,
  d: { codigo: string; unidadTexto: string; relacion: RelacionDeclarada; mensaje: string | null },
): Promise<{ ok: true; comunidad: string } | { ok: false; mensaje: string }> {
  if (usuario.rol !== "RESIDENTE") return { ok: false, mensaje: "Solo las cuentas de residentes pueden pedir vincularse con una unidad." };
  const comunidad = await comunidadPorCodigo(d.codigo);
  if (!comunidad) return { ok: false, mensaje: "No encontramos una comunidad con ese código. Pídelo a tu administración." };
  // Una cuenta de residente pertenece a una sola administración (la de su primera comunidad).
  if (usuario.administradoraId && usuario.administradoraId !== comunidad.administradoraId) {
    return {
      ok: false,
      mensaje: "Tu cuenta ya está vinculada con comunidades de otra administración. Por ahora, para esta comunidad crea otra cuenta con otro correo.",
    };
  }
  const pendientes = await db.solicitudVinculo.count({ where: { usuarioId: usuario.id, estado: "PENDIENTE" } });
  if (pendientes >= MAX_SOLICITUDES_PENDIENTES) {
    return { ok: false, mensaje: `Ya tienes ${pendientes} solicitudes pendientes. Espera a que la administración las revise.` };
  }
  try {
    await db.solicitudVinculo.create({
      data: {
        usuarioId: usuario.id,
        administradoraId: comunidad.administradoraId,
        condominioId: comunidad.id,
        unidadTexto: d.unidadTexto,
        relacion: d.relacion,
        mensaje: d.mensaje,
      },
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      return { ok: false, mensaje: `Ya tienes una solicitud pendiente en ${comunidad.nombre}. Espera a que la revisen o cancélala para enviar otra.` };
    }
    throw e;
  }
  return { ok: true, comunidad: comunidad.nombre };
}

export async function cancelarSolicitud(usuario: UsuarioActual, solicitudId: string) {
  await db.solicitudVinculo.updateMany({
    where: { id: solicitudId, usuarioId: usuario.id, estado: "PENDIENTE" },
    data: { estado: "CANCELADA", revisadoEn: new Date(), revisadoPorNombre: usuario.nombre },
  });
}

/** Solicitud que la cuenta puede revisar (de su administradora y de una comunidad a su alcance). */
async function solicitudRevisable(autor: UsuarioActual, solicitudId: string) {
  if (!autor.administradoraId) return null;
  const s = await db.solicitudVinculo.findFirst({
    where: { id: solicitudId, administradoraId: autor.administradoraId },
    include: {
      usuario: { select: { id: true, nombre: true, correo: true, telefono: true, activo: true, correoVerificadoEn: true, personaId: true, administradoraId: true, rol: true } },
      condominio: { select: { nombre: true, estado: true } },
    },
  });
  if (!s || !puede(autor, "solicitudes.revisar", s.condominioId)) return null;
  return s;
}

export type DecisionAprobacion = { unidadId: string; personaId: string | "NUEVA"; relacion: RelacionDeclarada };

/**
 * Aprueba una solicitud: vincula la cuenta con una ficha de persona (la que ya existía, por
 * ejemplo de la carga Excel, o una nueva) y registra los vínculos de COM-001 con la unidad.
 * Todo en una transacción; si algo no cuadra, no queda nada a medias.
 */
export async function aprobarSolicitud(autor: UsuarioActual, solicitudId: string, d: DecisionAprobacion): Promise<string | null> {
  const s = await solicitudRevisable(autor, solicitudId);
  if (!s) return "Solicitud no encontrada.";
  if (s.estado !== "PENDIENTE") return "Esta solicitud ya fue revisada.";
  if (!operaAdministracion(s.condominio.estado as Estado)) {
    return "La comunidad sigue en configuración. Habilítala en Configuración antes de dar acceso a los residentes.";
  }
  const u = s.usuario;
  if (!u.activo || u.rol !== "RESIDENTE") return "Esta cuenta ya no puede vincularse.";
  if (!u.correoVerificadoEn) return "La persona todavía no confirma su correo. Espera a que lo haga (o envíale el enlace de confirmación).";
  if (u.administradoraId && u.administradoraId !== s.administradoraId) return "Esta cuenta pertenece a otra administración.";
  const administradoraId = s.administradoraId;

  try {
    await db.$transaction(async (tx) => {
      const tomada = await tx.solicitudVinculo.updateMany({ where: { id: s.id, estado: "PENDIENTE" }, data: { estado: "APROBADA" } });
      if (tomada.count === 0) throw new ErrorCuenta("Esta solicitud ya fue revisada.");
      const unidad = await tx.unidad.findFirst({
        where: { id: d.unidadId, condominioId: s.condominioId, administradoraId },
        select: { id: true, numero: true },
      });
      if (!unidad) throw new ErrorCuenta("Elige una unidad de esta comunidad.");

      // La ficha de la persona: la que ya tiene la cuenta, una existente elegida, o una nueva.
      let personaId = u.personaId;
      if (personaId) {
        if (d.personaId !== "NUEVA" && d.personaId !== personaId) {
          throw new ErrorCuenta("Esta cuenta ya está unida a otra ficha de persona; se usa esa.");
        }
      } else if (d.personaId === "NUEVA") {
        const mismoCorreo = await tx.persona.findFirst({
          where: { administradoraId, correo: { equals: u.correo, mode: "insensitive" } },
          select: { nombre: true },
        });
        if (mismoCorreo) {
          throw new ErrorCuenta(`Ya existe la ficha de ${mismoCorreo.nombre} con este correo. Elígela para no duplicar a la persona.`);
        }
        const nueva = await tx.persona.create({
          data: { administradoraId, nombre: u.nombre, correo: u.correo, telefono: u.telefono },
        });
        personaId = nueva.id;
      } else {
        const ficha = await tx.persona.findFirst({
          where: { id: d.personaId, administradoraId },
          select: { id: true, usuario: { select: { id: true } } },
        });
        if (!ficha) throw new ErrorCuenta("Ficha de persona no encontrada.");
        if (ficha.usuario && ficha.usuario.id !== u.id) {
          throw new ErrorCuenta("Esa ficha ya tiene otra cuenta. Si es la misma persona, desactiva la otra cuenta primero.");
        }
        personaId = ficha.id;
      }

      const vigentes = await tx.vinculoUnidad.findMany({
        where: { unidadId: unidad.id, personaId, hasta: null },
        select: { tipo: true },
      });
      for (const tipo of vinculosDeRelacion(d.relacion)) {
        if (vigentes.some((v) => v.tipo === tipo)) continue;
        const error = await crearVinculo(tx, {
          administradoraId,
          unidadId: unidad.id,
          personaId,
          tipo,
          desde: hoyDia(),
          respaldo: "Solicitud desde la app aprobada por la administración",
          creadoPor: autor.nombre,
        });
        if (error) throw new ErrorCuenta(error);
      }
      await tx.usuario.update({ where: { id: u.id }, data: { personaId, administradoraId } });
      await tx.solicitudVinculo.update({
        where: { id: s.id },
        data: { unidadId: unidad.id, personaId, relacion: d.relacion, revisadoEn: new Date(), revisadoPorNombre: autor.nombre },
      });
      await registrarEn(tx, {
        autor,
        accion: "Aprobó una solicitud de vínculo con una unidad",
        detalle: `${u.nombre} (${u.correo}): unidad ${unidad.numero}, ${RELACIONES[d.relacion].texto.toLowerCase()}`,
        condominioId: s.condominioId,
        entidad: "SolicitudVinculo",
        entidadId: s.id,
      });
    });
  } catch (e) {
    if (e instanceof ErrorCuenta) return e.message;
    if ((e as { code?: string }).code === "P2002") return "Esa ficha ya tiene otra cuenta.";
    throw e;
  }

  const origen = await origenDelSitio();
  await enviarCorreo({
    para: u.correo,
    asunto: `Ya tienes acceso a ${s.condominio.nombre}`,
    texto: `Hola, ${primerNombre(u.nombre)}:\n\nLa administración aprobó tu solicitud. Ya puedes ver tu estado de cuenta y la información de ${s.condominio.nombre} en ${origen}/login/residentes`,
    html: `<p>Hola, ${escaparHtml(primerNombre(u.nombre))}:</p><p>La administración aprobó tu solicitud. Ya puedes ver tu estado de cuenta y la información de <strong>${escaparHtml(s.condominio.nombre)}</strong>.</p>${boton(`${origen}/login/residentes`, "Ingresar")}`,
  });
  return null;
}

export async function rechazarSolicitud(autor: UsuarioActual, solicitudId: string, motivo: string): Promise<string | null> {
  const s = await solicitudRevisable(autor, solicitudId);
  if (!s) return "Solicitud no encontrada.";
  const { count } = await db.solicitudVinculo.updateMany({
    where: { id: s.id, estado: "PENDIENTE" },
    data: { estado: "RECHAZADA", motivo, revisadoEn: new Date(), revisadoPorNombre: autor.nombre },
  });
  if (count === 0) return "Esta solicitud ya fue revisada.";
  await registrar(autor, "Rechazó una solicitud de vínculo con una unidad", `${s.usuario.nombre} (${s.usuario.correo}): ${motivo}`, s.condominioId);
  if (s.usuario.correoVerificadoEn) {
    await enviarCorreo({
      para: s.usuario.correo,
      asunto: `Tu solicitud en ${s.condominio.nombre}`,
      texto: `Hola, ${primerNombre(s.usuario.nombre)}:\n\nLa administración de ${s.condominio.nombre} no pudo aprobar tu solicitud. Motivo: ${motivo}\n\nPuedes revisar el detalle y enviar una nueva en tu cuenta.`,
      html: `<p>Hola, ${escaparHtml(primerNombre(s.usuario.nombre))}:</p><p>La administración de ${escaparHtml(s.condominio.nombre)} no pudo aprobar tu solicitud.</p><p><strong>Motivo:</strong> ${escaparHtml(motivo)}</p><p>Puedes revisar el detalle y enviar una nueva en tu cuenta.</p>`,
    });
  }
  return null;
}

/** La administración genera el enlace de confirmación de correo de quien pidió unirse a su comunidad. */
export async function enlaceVerificacionDeSolicitud(autor: UsuarioActual, solicitudId: string) {
  const s = await solicitudRevisable(autor, solicitudId);
  if (!s || s.estado !== "PENDIENTE" || s.usuario.correoVerificadoEn) return null;
  const enlace = await nuevoEnlaceVerificacion(s.usuario.id);
  await registrar(autor, "Generó el enlace para confirmar el correo de un solicitante", `${s.usuario.nombre} (${s.usuario.correo})`, s.condominioId);
  return { enlace, telefono: s.usuario.telefono, nombre: s.usuario.nombre };
}

/** Crea (o cambia) el código de incorporación de una comunidad. El anterior deja de servir. */
export async function renovarCodigoComunidad(condominioId: string) {
  for (let intento = 0; intento < 5; intento++) {
    try {
      const codigo = nuevoCodigoComunidad();
      await db.condominio.update({ where: { id: condominioId }, data: { codigoIncorporacion: codigo } });
      return codigo;
    } catch (e) {
      if ((e as { code?: string }).code !== "P2002") throw e;
    }
  }
  throw new Error("No se pudo generar un código único.");
}

// ---------------------------------------------------------------------------
// Invitaciones al equipo de la administración

export type PerfilEquipo = "PRINCIPAL" | "ADMINISTRADOR" | Cargo | "COMITE";

export type ResultadoInvitacionEquipo =
  | { ok: true; nombre: string; correo: string; enlace: string; correoEstado: "ENVIADO" | "SIMULADO" | "ERROR" }
  | { ok: false; mensaje?: string; errores?: Record<string, string[]> };

/**
 * El administrador principal invita a alguien de su equipo. La cuenta se crea sin contraseña
 * usable: la persona la crea con el enlace que le llega (sirve una vez y por DIAS_INVITACION días).
 * Nadie recibe ni escribe la contraseña de otro.
 */
export async function invitarEquipo(
  autor: UsuarioActual,
  administradoraId: string,
  d: { nombre: string; correo: string; perfil: PerfilEquipo; condominioIds: string[]; permisosExtra: string[] },
): Promise<ResultadoInvitacionEquipo> {
  if (!puede(autor, "cuentas.administrar")) return { ok: false, mensaje: "Solo el administrador principal invita al equipo." };
  if (await db.usuario.findUnique({ where: { correo: d.correo }, select: { id: true } })) {
    return { ok: false, errores: { correo: ["Ese correo ya tiene una cuenta en Convive. Usa otro correo."] } };
  }
  const ids = (
    await db.condominio.findMany({ where: { administradoraId, id: { in: d.condominioIds } }, select: { id: true } })
  ).map((c) => c.id);
  if (d.perfil === "COMITE" && ids.length !== 1) return { ok: false, errores: { asignados: ["El comité ve una sola comunidad: elige una."] } };
  if (d.perfil !== "PRINCIPAL" && d.perfil !== "COMITE" && ids.length === 0) {
    return { ok: false, errores: { asignados: ["Elige al menos una comunidad."] } };
  }
  const cargo = d.perfil === "PRINCIPAL" || d.perfil === "ADMINISTRADOR" || d.perfil === "COMITE" ? null : d.perfil;
  const conExtras = d.perfil === "ASISTENTE";
  const permisosExtra = conExtras ? d.permisosExtra.filter(esPermisoAsignable) : [];

  const claveHash = await bcrypt.hash(randomBytes(24).toString("base64url"), 10);
  const creado = await db.usuario.create({
    data: {
      administradoraId,
      nombre: d.nombre,
      correo: d.correo,
      claveHash,
      rol: d.perfil === "COMITE" ? "COMITE" : "ADMINISTRADOR",
      accesoTodas: d.perfil === "PRINCIPAL",
      cargo,
      permisosExtra,
      condominioId: d.perfil === "COMITE" ? ids[0] : null,
      // El correo se confirma al usar el enlace de la invitación.
      correoVerificadoEn: null,
      ...(d.perfil !== "PRINCIPAL" && d.perfil !== "COMITE" ? { asignaciones: { create: ids.map((id) => ({ condominioId: id })) } } : {}),
    },
  });
  const token = await crearToken(creado.id, "INVITACION");
  const enlace = `${await origenDelSitio()}/invitacion/${token}`;
  const adm = autor.administradora?.nombre ?? MARCA.nombre;
  const envio = await enviarCorreo({
    para: d.correo,
    asunto: `${autor.nombre} te invitó a ${MARCA.nombre}`,
    texto: `Hola, ${primerNombre(d.nombre)}:\n\n${autor.nombre} te invitó a trabajar con ${adm} en ${MARCA.nombre}.\n\nCrea tu contraseña con este enlace (sirve una sola vez y durante ${DIAS_INVITACION} días):\n\n${enlace}\n\nTu usuario es este correo: ${d.correo}`,
    html: `<p>Hola, ${escaparHtml(primerNombre(d.nombre))}:</p><p>${escaparHtml(autor.nombre)} te invitó a trabajar con <strong>${escaparHtml(adm)}</strong> en ${escaparHtml(MARCA.nombre)}.</p>${boton(enlace, "Crear mi contraseña")}<p>El enlace sirve una sola vez y durante ${DIAS_INVITACION} días. Tu usuario es este correo: ${escaparHtml(d.correo)}</p>`,
  });
  await registrar(autor, "Invitó a una persona del equipo", `${d.nombre} (${d.correo}) como ${d.perfil.toLowerCase()}`);
  return { ok: true, nombre: d.nombre, correo: d.correo, enlace, correoEstado: envio.estado };
}

/** Renueva la invitación de alguien del equipo que todavía no crea su contraseña. */
export async function renovarInvitacionEquipo(autor: UsuarioActual, administradoraId: string, usuarioId: string) {
  if (!puede(autor, "cuentas.administrar")) return null;
  const u = await db.usuario.findFirst({
    where: { id: usuarioId, administradoraId, rol: { in: ["ADMINISTRADOR", "COMITE"] }, claveActualizadaEn: null, correoVerificadoEn: null },
    select: { id: true, nombre: true, correo: true },
  });
  if (!u) return null;
  await db.tokenRecuperacion.updateMany({ where: { usuarioId: u.id, tipo: "INVITACION", usadoEn: null }, data: { usadoEn: new Date() } });
  const token = await crearToken(u.id, "INVITACION");
  const enlace = `${await origenDelSitio()}/invitacion/${token}`;
  await enviarCorreo({
    para: u.correo,
    asunto: `Tu invitación a ${MARCA.nombre}`,
    texto: `Hola, ${primerNombre(u.nombre)}:\n\nCrea tu contraseña con este enlace (sirve una sola vez y durante ${DIAS_INVITACION} días):\n\n${enlace}`,
    html: `<p>Hola, ${escaparHtml(primerNombre(u.nombre))}:</p>${boton(enlace, "Crear mi contraseña")}<p>El enlace sirve una sola vez y durante ${DIAS_INVITACION} días.</p>`,
  });
  await registrar(autor, "Renovó la invitación de una persona del equipo", `${u.nombre} (${u.correo})`);
  return enlace;
}
