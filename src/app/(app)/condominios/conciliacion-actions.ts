"use server";

// FIN-003.1 · Acciones de Conciliación bancaria: cuentas, cartolas, perfiles y estado de revisión.
// Todo exige el permiso banco.importar (administradores, no comité) y que la comunidad sea de la
// administradora y esté en el alcance de la cuenta; cuentas, perfiles y movimientos se buscan
// siempre junto con su administradora y comunidad.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { puedeVerPropiedad, requireAdministradora } from "@/lib/auth";
import { erroresDe, type EstadoForm } from "@/lib/forms";
import { registrar } from "@/lib/registro";
import { CAMPOS_CARTOLA, revisarMapeoCartola, type EstadoCartola, type MapeoCartola, type OpcionesEnvio } from "@/lib/cartolas";
import { confirmarCartola, revisarCartola, type CuentaDeCartola } from "@/lib/cartolas-servicio";
import { normalizarTitulo } from "@/lib/importacion";

const ruta = (condominioId: string) => `/condominios/${condominioId}/conciliacion`;

async function acceso(condominioId: string) {
  const { usuario, administradoraId } = await requireAdministradora("banco.importar");
  const condominio = await db.condominio.findFirst({ where: { id: condominioId, administradoraId }, select: { id: true, nombre: true } });
  if (!condominio || !puedeVerPropiedad(usuario, condominioId)) return null;
  return { usuario, administradoraId, condominio };
}

async function cuentaDe(condominioId: string, cuentaId: string, administradoraId: string): Promise<CuentaDeCartola | null> {
  return db.cuentaBancaria.findFirst({
    where: { id: cuentaId, condominioId, administradoraId, activa: true },
    select: { id: true, banco: true, numeroFinal: true, condominioId: true, administradoraId: true },
  });
}

// ---------------------------------------------------------------------------
// Cuentas bancarias

const CuentaSchema = z.object({
  banco: z.string({ error: "Elige el banco." }).trim().min(2, { error: "Elige el banco." }).max(60),
  tipo: z.enum(["CORRIENTE", "VISTA", "AHORRO"], { error: "Elige el tipo de cuenta." }),
  numeroFinal: z.string().trim().regex(/^\d{4}$/, { error: "Escribe solo los últimos 4 dígitos del número de cuenta." }),
  alias: z.string().trim().max(60).optional(),
});

/** Registra una cuenta bancaria de la comunidad (solo banco, tipo y últimos 4 dígitos). */
export async function crearCuenta(condominioId: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const a = await acceso(condominioId);
  if (!a) return { mensaje: "Comunidad no encontrada." };
  const otro = String(formData.get("bancoOtro") ?? "").trim();
  const banco = formData.get("banco") === "Otro" ? otro : String(formData.get("banco") ?? "");
  const valores = Object.fromEntries([...formData.entries()].filter(([k]) => !k.startsWith("$")).map(([k, v]) => [k, String(v)]));
  const datos = CuentaSchema.safeParse({
    banco,
    tipo: formData.get("tipo"),
    numeroFinal: formData.get("numeroFinal"),
    alias: String(formData.get("alias") ?? "").trim() || undefined,
  });
  if (!datos.success) return { ...erroresDe(datos.error), valores };
  const repetida = await db.cuentaBancaria.findFirst({ where: { condominioId, banco: datos.data.banco, numeroFinal: datos.data.numeroFinal } });
  if (repetida) return { mensaje: `Ya está registrada la cuenta ${datos.data.banco} terminada en ${datos.data.numeroFinal}.`, valores };
  const cuenta = await db.cuentaBancaria.create({
    data: { ...datos.data, administradoraId: a.administradoraId, condominioId, creadoPor: a.usuario.nombre },
  });
  await registrar(a.usuario, "Registró una cuenta bancaria", `${a.condominio.nombre}: ${cuenta.banco} ···${cuenta.numeroFinal}`, condominioId);
  revalidatePath(ruta(condominioId));
  return { ok: true, mensaje: cuenta.id };
}

/** Quita una cuenta registrada por error (solo si todavía no tiene cartolas importadas). */
export async function eliminarCuenta(condominioId: string, cuentaId: string): Promise<EstadoForm> {
  const a = await acceso(condominioId);
  if (!a) return { mensaje: "Comunidad no encontrada." };
  const cuenta = await db.cuentaBancaria.findFirst({
    where: { id: cuentaId, condominioId, administradoraId: a.administradoraId },
    include: { _count: { select: { importaciones: true } } },
  });
  if (!cuenta) return { mensaje: "Esa cuenta ya no existe." };
  if (cuenta._count.importaciones > 0) return { mensaje: "La cuenta ya tiene cartolas importadas y no se puede quitar." };
  await db.cuentaBancaria.delete({ where: { id: cuenta.id } });
  await registrar(a.usuario, "Quitó una cuenta bancaria", `${a.condominio.nombre}: ${cuenta.banco} ···${cuenta.numeroFinal}`, condominioId);
  revalidatePath(ruta(condominioId));
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Cartolas

const DESTINOS = [...CAMPOS_CARTOLA.map((c) => c.clave), "ignorar"] as const;
const FormatosSchema = z.object({
  fecha: z.enum(["AUTO", "DMA", "MDA", "AMD"]),
  decimal: z.enum(["AUTO", "COMA", "PUNTO"]),
  signo: z.enum(["POSITIVO_ABONO", "POSITIVO_CARGO"]),
});
const OpcionesSchema = z.object({
  hojas: z.array(z.string().max(300)).max(20).optional(),
  mapeo: z.record(z.string().max(300), z.enum(DESTINOS)).optional(),
  formatos: FormatosSchema.optional(),
  guardarPerfil: z
    .object({
      nombre: z.string().trim().min(2, { error: "Ponle un nombre al perfil (al menos 2 letras)." }).max(60),
      banco: z.string().trim().min(2, { error: "Indica el banco del perfil." }).max(60),
    })
    .optional(),
  decisiones: z.record(z.string().regex(/^[0-9a-f]{64}$/), z.enum(["importar", "omitir"])).optional(),
  omitirErrores: z.boolean().optional(),
  esperado: z.object({ nuevos: z.number().int(), registrados: z.number().int(), porRevisar: z.number().int() }).optional(),
});

function leerEnvio(formData: FormData): { ok: true; archivo: File; opciones: OpcionesEnvio } | { ok: false; mensaje: string } {
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, mensaje: "Elige la cartola (.xlsx o .csv)." };
  try {
    const datos = OpcionesSchema.safeParse(JSON.parse(String(formData.get("opciones") ?? "{}")));
    if (!datos.success) return { ok: false, mensaje: datos.error.issues[0]?.message ?? "No pude leer las opciones. Vuelve a empezar." };
    const opciones = datos.data;
    // Los títulos del asistente llegan tal como se ven; se guardan normalizados.
    if (opciones.mapeo) opciones.mapeo = Object.fromEntries(Object.entries(opciones.mapeo).map(([t, d]) => [normalizarTitulo(t), d]).filter(([t]) => t));
    return { ok: true, archivo, opciones };
  } catch {
    return { ok: false, mensaje: "No pude leer las opciones. Vuelve a empezar." };
  }
}

/** Paso 1: leer la cartola y devolver la vista previa o el asistente de columnas. Nada se guarda. */
export async function revisarCartolaAccion(condominioId: string, cuentaId: string, formData: FormData): Promise<EstadoCartola> {
  const a = await acceso(condominioId);
  if (!a) return { etapa: "inicio", mensaje: "Comunidad no encontrada." };
  const cuenta = await cuentaDe(condominioId, cuentaId, a.administradoraId);
  if (!cuenta) return { etapa: "inicio", mensaje: "Elige una cuenta bancaria de esta comunidad." };
  const envio = leerEnvio(formData);
  if (!envio.ok) return { etapa: "inicio", mensaje: envio.mensaje };
  try {
    const r = await revisarCartola(a.usuario, cuenta, envio.archivo, envio.opciones);
    if (r.etapa === "revision" && r.perfilGuardado) revalidatePath(ruta(condominioId), "layout");
    return r;
  } catch (e) {
    console.error("Error al revisar cartola:", e);
    return { etapa: "inicio", mensaje: "No se pudo leer la cartola. Revisa que sea la descargada del banco e inténtalo de nuevo." };
  }
}

/** Paso 2: confirmar e incorporar los movimientos nuevos (todo o nada). */
export async function confirmarCartolaAccion(condominioId: string, cuentaId: string, formData: FormData): Promise<EstadoCartola> {
  const a = await acceso(condominioId);
  if (!a) return { etapa: "inicio", mensaje: "Comunidad no encontrada." };
  const cuenta = await cuentaDe(condominioId, cuentaId, a.administradoraId);
  if (!cuenta) return { etapa: "inicio", mensaje: "Elige una cuenta bancaria de esta comunidad." };
  const envio = leerEnvio(formData);
  if (!envio.ok) return { etapa: "inicio", mensaje: envio.mensaje };
  try {
    const r = await confirmarCartola(a.usuario, cuenta, envio.archivo, envio.opciones);
    if (r.etapa === "listo") revalidatePath(ruta(condominioId), "layout");
    return r;
  } catch (e) {
    console.error("Error al importar cartola:", e);
    return { etapa: "inicio", mensaje: "No se pudo completar la importación y no se guardó nada. Inténtalo de nuevo en un momento." };
  }
}

// ---------------------------------------------------------------------------
// Perfiles de cartola

const PerfilSchema = z.object({
  nombre: z.string().trim().min(2, { error: "Ponle un nombre de al menos 2 letras." }).max(60),
  banco: z.string().trim().min(2, { error: "Indica el banco." }).max(60),
  formatoFecha: FormatosSchema.shape.fecha,
  separadorDecimal: FormatosSchema.shape.decimal,
  signoMonto: FormatosSchema.shape.signo,
});

/** Edita un perfil: nombre, banco, formatos y qué campo es cada columna. */
export async function actualizarPerfil(condominioId: string, perfilId: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const a = await acceso(condominioId);
  if (!a) return { mensaje: "Comunidad no encontrada." };
  const perfil = await db.perfilCartola.findFirst({ where: { id: perfilId, administradoraId: a.administradoraId } });
  if (!perfil) return { mensaje: "Ese perfil ya no existe." };
  const datos = PerfilSchema.safeParse({
    nombre: formData.get("nombre"),
    banco: formData.get("banco"),
    formatoFecha: formData.get("formatoFecha"),
    separadorDecimal: formData.get("separadorDecimal"),
    signoMonto: formData.get("signoMonto"),
  });
  if (!datos.success) return erroresDe(datos.error);
  const columnas: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (!k.startsWith("col:") || typeof v !== "string") continue;
    const t = normalizarTitulo(k.slice(4));
    if (t && (DESTINOS as readonly string[]).includes(v)) columnas[t] = v;
  }
  const error = revisarMapeoCartola(columnas as MapeoCartola);
  if (error) return { mensaje: error };
  const otro = await db.perfilCartola.findFirst({ where: { administradoraId: a.administradoraId, nombre: datos.data.nombre, NOT: { id: perfil.id } } });
  if (otro) return { mensaje: "Ya hay otro perfil con ese nombre." };
  await db.perfilCartola.update({ where: { id: perfil.id }, data: { ...datos.data, columnas, creadoPor: a.usuario.nombre } });
  await registrar(a.usuario, "Modificó un perfil de cartola bancaria", `${datos.data.banco} — ${datos.data.nombre}`, condominioId);
  revalidatePath(`${ruta(condominioId)}/perfiles`);
  return { ok: true, mensaje: "Perfil guardado." };
}

/** Borra un perfil. Los movimientos ya importados no cambian. */
export async function eliminarPerfilCartola(condominioId: string, perfilId: string): Promise<EstadoForm> {
  const a = await acceso(condominioId);
  if (!a) return { mensaje: "Comunidad no encontrada." };
  const perfil = await db.perfilCartola.findFirst({ where: { id: perfilId, administradoraId: a.administradoraId } });
  if (!perfil) return { mensaje: "Ese perfil ya no existe." };
  await db.perfilCartola.delete({ where: { id: perfil.id } });
  await registrar(a.usuario, "Eliminó un perfil de cartola bancaria", `${perfil.banco} — ${perfil.nombre}`, condominioId);
  revalidatePath(`${ruta(condominioId)}/perfiles`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Estado de revisión de un movimiento (la conciliación con pagos y egresos es FIN-003.2)

const RevisionSchema = z.object({
  estado: z.enum(["PENDIENTE", "REVISAR"]),
  nota: z.string().trim().max(300).optional(),
});

/** Marca un movimiento como «Requiere revisión» (con nota) o lo devuelve a «Pendiente de identificar». */
export async function marcarMovimiento(condominioId: string, movimientoId: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const a = await acceso(condominioId);
  if (!a) return { mensaje: "Comunidad no encontrada." };
  const datos = RevisionSchema.safeParse({ estado: formData.get("estado"), nota: String(formData.get("nota") ?? "").trim() || undefined });
  if (!datos.success) return { mensaje: "Elige un estado válido." };
  const mov = await db.movimientoBancario.findFirst({ where: { id: movimientoId, condominioId, administradoraId: a.administradoraId } });
  if (!mov) return { mensaje: "Ese movimiento no existe." };
  if (mov.estado === "CONCILIADO" || mov.estado === "SUGERIDA") return { mensaje: "Este movimiento ya está en conciliación y no se cambia desde aquí." };
  await db.movimientoBancario.update({ where: { id: mov.id }, data: { estado: datos.data.estado, nota: datos.data.nota ?? null } });
  await registrar(
    a.usuario,
    datos.data.estado === "REVISAR" ? "Marcó un movimiento bancario para revisión" : "Dejó un movimiento bancario pendiente de identificar",
    `${mov.fecha.toISOString().slice(0, 10).split("-").reverse().join("-")} · ${Number(mov.monto).toLocaleString("es-CL")}${datos.data.nota ? ` · ${datos.data.nota}` : ""}`,
    condominioId,
  );
  revalidatePath(`${ruta(condominioId)}/movimientos`);
  return { ok: true };
}
