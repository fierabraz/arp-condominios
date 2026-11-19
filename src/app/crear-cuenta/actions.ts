"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { aTexto, erroresDe, type EstadoForm } from "@/lib/forms";
import { anotarIntento, bloqueoVigente, ipCliente } from "@/lib/intentos";
import { comunidadPorCodigo, registrarAdministrador, registrarResidente, type ResultadoRegistro } from "@/lib/cuentas";
import { ORDEN_RELACIONES } from "@/lib/cuentas-reglas";
import { confirmarCorreo } from "@/lib/recuperacion";
import { LOGIN, tipoDeRol } from "@/lib/session";
import { ClaveSchema, CorreoSchema } from "@/lib/usuarios";

// PILOTO-001: registro público. Nada de lo que llega aquí puede elegir un rol ni una comunidad
// con acceso: el rol lo fija el camino (administración con código, o residente sin acceso).

const Base = z
  .object({
    nombre: z.string({ error: "Ingresa tu nombre." }).min(3, { error: "Ingresa tu nombre y apellido." }).max(120),
    correo: CorreoSchema,
    telefono: z
      .string()
      .max(30)
      .regex(/^[+\d\s()-]{8,}$/, { error: "Escribe un teléfono válido, ej. +56 9 1234 5678." })
      .optional(),
    clave: ClaveSchema,
    repetir: z.string({ error: "Repite la contraseña." }),
  })
  .refine((d) => d.clave === d.repetir, { error: "Las contraseñas no coinciden.", path: ["repetir"] });

const leerBase = (f: FormData) => ({
  nombre: aTexto(f.get("nombre")),
  correo: aTexto(f.get("correo")),
  telefono: aTexto(f.get("telefono")),
  clave: aTexto(f.get("clave")),
  repetir: aTexto(f.get("repetir")),
});

/** Lo escrito (sin contraseñas) para no borrar el formulario cuando hay que corregir algo. */
const valoresDe = (f: FormData, campos: string[]) =>
  Object.fromEntries(campos.map((c) => [c, String(f.get(c) ?? "")]));

function respuesta(r: ResultadoRegistro, valores: Record<string, string>): EstadoForm {
  if (!r.ok) return { errores: r.errores, mensaje: r.mensaje, valores };
  // Sin servicio de correo (o si falló), el enlace no llega: la persona debe pedirlo a Convive o a
  // su administración. El enlace nunca se muestra aquí, porque eso saltaría la verificación.
  const sinCorreo = r.envio === "SIMULADO" || r.envio === "ERROR";
  return { ok: true, valores: { correo: r.correo, sinCorreo: sinCorreo ? "1" : "" } };
}

/** Pocos intentos seguidos por conexión, para que nadie pruebe códigos ni cree cuentas en masa. */
async function frenado(ip: string | null) {
  const minutos = await bloqueoVigente(`registro:${ip ?? "?"}`, null);
  return minutos > 0 ? `Hubo demasiados intentos. Espera ${minutos} ${minutos === 1 ? "minuto" : "minutos"} y vuelve a intentarlo.` : null;
}

export async function crearCuentaAdministracion(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const valores = valoresDe(formData, ["codigo", "nombre", "correo", "telefono", "administracion"]);
  const ip = await ipCliente();
  const freno = await frenado(ip);
  if (freno) return { mensaje: freno, valores };
  const datos = Base.and(
    z.object({
      codigo: z.string({ error: "Ingresa tu código de acceso." }).min(6, { error: "Ingresa tu código de acceso." }),
      administracion: z.string().max(120).optional(),
    }),
  ).safeParse({ ...leerBase(formData), codigo: aTexto(formData.get("codigo")), administracion: aTexto(formData.get("administracion")) });
  if (!datos.success) return { ...erroresDe(datos.error), valores };
  const d = datos.data;
  const r = await registrarAdministrador({
    codigo: d.codigo,
    nombre: d.nombre,
    correo: d.correo,
    telefono: d.telefono ?? null,
    clave: d.clave,
    administracion: d.administracion ?? null,
  });
  // Un código equivocado cuenta como intento fallido.
  await anotarIntento(`registro:${ip ?? "?"}`, null, r.ok);
  return respuesta(r, valores);
}

export async function crearCuentaResidente(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const valores = valoresDe(formData, ["comunidad", "nombre", "correo", "telefono", "unidad", "relacion", "mensaje"]);
  const ip = await ipCliente();
  const freno = await frenado(ip);
  if (freno) return { mensaje: freno, valores };
  const datos = Base.and(
    z.object({
      comunidad: z.string().max(20).optional(),
      unidad: z.string().max(60).optional(),
      relacion: z.enum(ORDEN_RELACIONES).optional(),
      mensaje: z.string().max(500).optional(),
    }),
  ).safeParse({
    ...leerBase(formData),
    comunidad: aTexto(formData.get("comunidad")),
    unidad: aTexto(formData.get("unidad")),
    relacion: aTexto(formData.get("relacion")),
    mensaje: aTexto(formData.get("mensaje")),
  });
  if (!datos.success) return { ...erroresDe(datos.error), valores };
  const d = datos.data;

  let solicitud = null;
  if (d.comunidad) {
    const comunidad = await comunidadPorCodigo(d.comunidad);
    if (!comunidad) {
      await anotarIntento(`registro:${ip ?? "?"}`, null, false);
      return { errores: { comunidad: ["No encontramos una comunidad con ese código. Revísalo o déjalo en blanco y agrégalo después."] }, valores };
    }
    const errores: Record<string, string[]> = {};
    if (!d.unidad) errores.unidad = ["Escribe tu unidad, ej. Depto 302 o Casa 14."];
    if (!d.relacion) errores.relacion = ["Elige tu relación con la unidad."];
    if (Object.keys(errores).length) return { errores, valores };
    solicitud = {
      condominioId: comunidad.id,
      administradoraId: comunidad.administradoraId,
      unidadTexto: d.unidad!,
      relacion: d.relacion!,
      mensaje: d.mensaje ?? null,
    };
  }
  const r = await registrarResidente({
    nombre: d.nombre,
    correo: d.correo,
    telefono: d.telefono ?? null,
    clave: d.clave,
    solicitud,
  });
  await anotarIntento(`registro:${ip ?? "?"}`, null, true);
  return respuesta(r, valores);
}

/** El nombre de la comunidad de un código, para que la persona confirme que es la suya. */
export async function consultarComunidad(codigo: string): Promise<string | null> {
  const ip = await ipCliente();
  if (await frenado(ip)) return null;
  const c = await comunidadPorCodigo(codigo);
  if (!c) await anotarIntento(`registro:${ip ?? "?"}`, null, false);
  return c?.nombre ?? null;
}

export async function confirmarMiCorreo(token: string): Promise<EstadoForm> {
  const usuario = await confirmarCorreo(token);
  if (!usuario) return { mensaje: "Este enlace ya se usó o venció. Ingresa con tu correo y contraseña: si aún falta confirmar, te enviaremos uno nuevo." };
  redirect(`${LOGIN[tipoDeRol(usuario.rol)]}?verificado=1`);
}
