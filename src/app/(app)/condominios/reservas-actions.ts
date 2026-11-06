"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { puedeVerPropiedad, requireAdministradora, type UsuarioActual } from "@/lib/auth";
import { aMonto, aNumero, aTexto, erroresDe, type EstadoForm } from "@/lib/forms";
import { registrar } from "@/lib/registro";
import { formatoDia, formatoMoneda, hoyChile } from "@/lib/formato";
import { nombrePeriodo } from "@/lib/cobro";
import { esDia, leerTurnos } from "@/lib/reservas";
import { cancelarReserva, confirmarReserva, crearReserva, ErrorReserva, rechazarReserva } from "@/lib/reservas-servicio";

// RES-001 · Acciones de la administración sobre espacios reservables y reservas.

const rutaReservas = (condominioId: string) => `/condominios/${condominioId}/reservas`;

const enteroOpcional = (min: number, max: number, texto: string) =>
  z
    .number({ error: texto })
    .int({ error: texto })
    .min(min, { error: texto })
    .max(max, { error: texto })
    .optional();

const EspacioSchema = z.object({
  nombre: z.string({ error: "Escribe el nombre." }).min(2, { error: "Escribe el nombre." }).max(80),
  descripcion: z.string().max(1000).optional(),
  normas: z.string().max(5000).optional(),
  capacidad: enteroOpcional(1, 10000, "Escribe un número de personas (o déjalo vacío)."),
  turnos: z
    .array(z.string().max(80, { error: "Cada turno puede tener hasta 80 letras." }))
    .max(12, { error: "Hasta 12 turnos por día." }),
  costo: z.number({ error: "Escribe el costo (0 si no se cobra)." }).min(0, { error: "No puede ser negativo." }).max(10_000_000),
  requiereAprobacion: z.boolean(),
  anticipacionMaximaDias: z
    .number({ error: "Escribe cuántos días." })
    .int({ error: "Escribe cuántos días." })
    .min(1, { error: "Al menos 1 día." })
    .max(365, { error: "Hasta 365 días." }),
  maximoPorMes: enteroOpcional(1, 31, "Escribe un número entre 1 y 31 (o déjalo vacío)."),
  bloquearMorosos: z.boolean(),
  activo: z.boolean(),
});

async function propiedadEditable(condominioId: string) {
  const { usuario, administradoraId } = await requireAdministradora();
  const condominio = await db.condominio.findFirst({ where: { id: condominioId, administradoraId } });
  if (!condominio || !puedeVerPropiedad(usuario, condominioId)) return null;
  return { usuario, administradoraId, condominio };
}

function valoresDe(formData: FormData) {
  return Object.fromEntries([...formData.entries()].filter(([k]) => !k.startsWith("$")).map(([k, v]) => [k, String(v)]));
}

/** Crea (espacioId vacío) o modifica un espacio reservable. */
export async function guardarEspacio(condominioId: string, espacioId: string | null, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const ctx = await propiedadEditable(condominioId);
  if (!ctx) return { mensaje: "Propiedad no encontrada." };
  const datos = EspacioSchema.safeParse({
    nombre: aTexto(formData.get("nombre")),
    descripcion: aTexto(formData.get("descripcion")),
    normas: aTexto(formData.get("normas")),
    capacidad: aNumero(formData.get("capacidad")),
    turnos: leerTurnos(aTexto(formData.get("turnos"))),
    costo: aMonto(formData.get("costo")) ?? 0,
    requiereAprobacion: formData.get("requiereAprobacion") === "on",
    anticipacionMaximaDias: aNumero(formData.get("anticipacionMaximaDias")),
    maximoPorMes: aNumero(formData.get("maximoPorMes")),
    bloquearMorosos: formData.get("bloquearMorosos") === "on",
    activo: espacioId ? formData.get("activo") === "on" : true,
  });
  if (!datos.success) return { ...erroresDe(datos.error), valores: valoresDe(formData) };
  const d = { ...datos.data, capacidad: datos.data.capacidad ?? null, maximoPorMes: datos.data.maximoPorMes ?? null };

  const repetido = await db.espacioReservable.findFirst({
    where: { condominioId, nombre: { equals: d.nombre, mode: "insensitive" }, ...(espacioId ? { NOT: { id: espacioId } } : {}) },
  });
  if (repetido) return { errores: { nombre: ["Ya hay un espacio con ese nombre."] }, valores: valoresDe(formData) };

  const moneda = ctx.usuario.administradora?.moneda;
  const resumen = `${d.nombre}: ${d.turnos.join(", ")}; ${d.costo > 0 ? formatoMoneda(d.costo, moneda) : "sin costo"}${d.requiereAprobacion ? "; requiere aprobación" : ""}`;
  if (espacioId) {
    const { count } = await db.espacioReservable.updateMany({ where: { id: espacioId, condominioId, administradoraId: ctx.administradoraId }, data: d });
    if (count === 0) return { mensaje: "Espacio no encontrado." };
    await registrar(ctx.usuario, "Modificó un espacio reservable", `${resumen}${d.activo ? "" : " (desactivado)"}`, condominioId);
    revalidatePath(rutaReservas(condominioId), "layout");
    return { ok: true, mensaje: "Cambios guardados." };
  }
  const e = await db.espacioReservable.create({ data: { ...d, condominioId, administradoraId: ctx.administradoraId } });
  await registrar(ctx.usuario, "Creó un espacio reservable", resumen, condominioId);
  revalidatePath(rutaReservas(condominioId), "layout");
  redirect(`${rutaReservas(condominioId)}?espacio=${e.id}`);
}

/** Borra un espacio que nunca tuvo reservas. Si tiene, hay que desactivarlo (para no perder el historial). */
export async function eliminarEspacio(condominioId: string, espacioId: string) {
  const ctx = await propiedadEditable(condominioId);
  if (!ctx) return;
  const e = await db.espacioReservable.findFirst({
    where: { id: espacioId, condominioId },
    include: { _count: { select: { reservas: true } } },
  });
  if (!e || e._count.reservas > 0) return;
  await db.espacioReservable.delete({ where: { id: e.id } });
  await registrar(ctx.usuario, "Eliminó un espacio reservable", e.nombre, condominioId);
  revalidatePath(rutaReservas(condominioId), "layout");
  redirect(`${rutaReservas(condominioId)}/espacios`);
}

const NuevaReservaSchema = z.object({
  espacioId: z.string({ error: "Elige el espacio." }).min(1, { error: "Elige el espacio." }),
  unidadId: z.string({ error: "Elige la unidad." }).min(1, { error: "Elige la unidad." }),
  dia: z.string({ error: "Elige el día." }).refine(esDia, { error: "Elige el día." }),
  turno: z.string({ error: "Elige el turno." }).min(1, { error: "Elige el turno." }),
  observaciones: z.string().max(500).optional(),
});

/** La administración reserva a nombre de una unidad (por ejemplo, si el residente llama o escribe). */
export async function reservarPorUnidad(condominioId: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const ctx = await propiedadEditable(condominioId);
  if (!ctx) return { mensaje: "Propiedad no encontrada." };
  const datos = NuevaReservaSchema.safeParse({
    espacioId: aTexto(formData.get("espacioId")),
    unidadId: aTexto(formData.get("unidadId")),
    dia: aTexto(formData.get("dia")),
    turno: aTexto(formData.get("turno")),
    observaciones: aTexto(formData.get("observaciones")),
  });
  if (!datos.success) return erroresDe(datos.error);
  let hecha: string;
  try {
    const { reserva, espacio, unidad } = await crearReserva(ctx.administradoraId, {
      ...datos.data,
      solicitadaPor: ctx.usuario.nombre,
      porAdministracion: true,
      hoy: hoyChile(),
    });
    await registrar(
      ctx.usuario,
      "Reservó un espacio común",
      `${espacio.nombre}, ${formatoDia(reserva.fecha)} (${reserva.turno}) para la unidad ${unidad.numero}`,
      condominioId,
    );
    revalidatePath(rutaReservas(condominioId), "layout");
    hecha = reserva.id;
  } catch (e) {
    if (e instanceof ErrorReserva) return { mensaje: e.message };
    throw e;
  }
  // Se vuelve a cargar con el mensaje: si el día quedó lleno, el formulario ya no aparece.
  redirect(`${rutaReservas(condominioId)}?espacio=${datos.data.espacioId}&dia=${datos.data.dia}&hecha=${hecha}`);
}

async function reservaDeLaAdministracion(id: string) {
  const { usuario, administradoraId } = await requireAdministradora();
  const r = await db.reserva.findFirst({ where: { id, administradoraId }, select: { condominioId: true } });
  if (!r || !puedeVerPropiedad(usuario, r.condominioId)) return null;
  return { usuario, administradoraId, condominioId: r.condominioId };
}

function detalle(r: { espacio: { nombre: string }; unidad: { numero: string }; fecha: Date; turno: string }) {
  return `${r.espacio.nombre}, ${formatoDia(r.fecha)} (${r.turno}), unidad ${r.unidad.numero}`;
}

export async function aprobarReserva(id: string): Promise<EstadoForm> {
  const ctx = await reservaDeLaAdministracion(id);
  if (!ctx) return { mensaje: "Reserva no encontrada." };
  let r: { espacioId: string; fecha: Date };
  try {
    const { reserva } = await confirmarReserva(id, ctx.administradoraId, ctx.usuario.nombre);
    await registrar(ctx.usuario, "Aprobó una reserva", detalle(reserva), ctx.condominioId);
    revalidatePath(rutaReservas(ctx.condominioId), "layout");
    r = reserva;
  } catch (e) {
    if (e instanceof ErrorReserva) return { mensaje: e.message };
    throw e;
  }
  redirect(`${rutaReservas(ctx.condominioId)}?espacio=${r.espacioId}&dia=${r.fecha.toISOString().slice(0, 10)}&hecha=${id}`);
}

const MotivoSchema = z.object({
  motivo: z.string({ error: "Escribe el motivo." }).min(3, { error: "Escribe el motivo." }).max(300, { error: "Máximo 300 caracteres." }),
});

export async function rechazarReservaConMotivo(id: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const ctx = await reservaDeLaAdministracion(id);
  if (!ctx) return { mensaje: "Reserva no encontrada." };
  const datos = MotivoSchema.safeParse({ motivo: aTexto(formData.get("motivo")) });
  if (!datos.success) return erroresDe(datos.error);
  try {
    const r = await rechazarReserva(id, ctx.administradoraId, ctx.usuario.nombre, datos.data.motivo);
    await registrar(ctx.usuario, "Rechazó una reserva", `${detalle(r)}. Motivo: ${datos.data.motivo}`, ctx.condominioId);
  } catch (e) {
    if (e instanceof ErrorReserva) return { mensaje: e.message };
    throw e;
  }
  revalidatePath(rutaReservas(ctx.condominioId), "layout");
  return { ok: true, mensaje: "Reserva rechazada. El turno quedó libre." };
}

export async function cancelarReservaAdministracion(id: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const ctx = await reservaDeLaAdministracion(id);
  if (!ctx) return { mensaje: "Reserva no encontrada." };
  const datos = MotivoSchema.safeParse({ motivo: aTexto(formData.get("motivo")) });
  if (!datos.success) return erroresDe(datos.error);
  return cancelar(ctx.usuario, ctx.administradoraId, ctx.condominioId, id, datos.data.motivo);
}

async function cancelar(usuario: UsuarioActual, administradoraId: string, condominioId: string, id: string, motivo: string): Promise<EstadoForm> {
  try {
    const { reserva, cargoQuitado, cargoSeMantiene } = await cancelarReserva(id, administradoraId, {
      por: usuario.nombre,
      motivo,
      porAdministracion: true,
      hoy: hoyChile(),
    });
    await registrar(usuario, "Canceló una reserva", `${detalle(reserva)}. Motivo: ${motivo}`, condominioId);
    revalidatePath(rutaReservas(condominioId), "layout");
    const p = reserva.gasto?.periodo;
    const mes = p ? nombrePeriodo(p.anio, p.mes).toLowerCase() : "";
    return {
      ok: true,
      mensaje: cargoSeMantiene
        ? `Reserva cancelada. Su cobro ya salió en el aviso de ${mes} y no se modificó: si corresponde devolverlo, regístralo como un ajuste.`
        : cargoQuitado
          ? `Reserva cancelada. Se quitó el cargo de ${mes}.`
          : "Reserva cancelada. El turno quedó libre.",
    };
  } catch (e) {
    if (e instanceof ErrorReserva) return { mensaje: e.message };
    throw e;
  }
}

