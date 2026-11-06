"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUsuario } from "@/lib/auth";
import { aTexto, erroresDe, type EstadoForm } from "@/lib/forms";
import { registrar } from "@/lib/registro";
import { formatoDia, hoyChile } from "@/lib/formato";
import { esDia } from "@/lib/reservas";
import { cancelarReserva, crearReserva, ErrorReserva } from "@/lib/reservas-servicio";
import { unidadesDelResidente } from "../../datos-residente";

// RES-001 · El residente reserva y cancela desde su cuenta. Solo puede usar sus propias unidades.

const ReservaSchema = z.object({
  espacioId: z.string({ error: "Elige el espacio." }).min(1, { error: "Elige el espacio." }),
  unidadId: z.string({ error: "Elige la unidad." }).min(1, { error: "Elige la unidad." }),
  dia: z.string({ error: "Elige el día." }).refine(esDia, { error: "Elige el día." }),
  turno: z.string({ error: "Elige el turno." }).min(1, { error: "Elige el turno." }),
  observaciones: z.string().max(500, { error: "Máximo 500 caracteres." }).optional(),
});

async function residente() {
  const usuario = await requireUsuario(["RESIDENTE"]);
  const unidades = await unidadesDelResidente(usuario.personaId);
  return { usuario, unidades };
}

export async function reservarEspacio(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const { usuario, unidades } = await residente();
  const datos = ReservaSchema.safeParse({
    espacioId: aTexto(formData.get("espacioId")),
    unidadId: aTexto(formData.get("unidadId")),
    dia: aTexto(formData.get("dia")),
    turno: aTexto(formData.get("turno")),
    observaciones: aTexto(formData.get("observaciones")),
  });
  if (!datos.success) return erroresDe(datos.error);
  const unidad = unidades.find((u) => u.id === datos.data.unidadId);
  if (!unidad || !usuario.administradoraId) return { errores: { unidadId: ["Unidad no encontrada."] } };
  const espacio = await db.espacioReservable.findFirst({
    where: { id: datos.data.espacioId, condominioId: unidad.condominioId },
    select: { normas: true },
  });
  if (!espacio) return { mensaje: "Espacio no encontrado." };
  if (espacio.normas && formData.get("aceptaNormas") !== "on") return { mensaje: "Para reservar, acepta las normas de uso del espacio." };

  let hecha: { id: string; espacioId: string; dia: string; unidadId: string };
  try {
    const r = await crearReserva(usuario.administradoraId, {
      ...datos.data,
      solicitadaPor: usuario.nombre,
      porAdministracion: false,
      hoy: hoyChile(),
    });
    await registrar(
      usuario,
      r.reserva.estado === "PENDIENTE" ? "Pidió una reserva" : "Reservó un espacio común",
      `${r.espacio.nombre}, ${formatoDia(r.reserva.fecha)} (${r.reserva.turno}) para la unidad ${r.unidad.numero}`,
      unidad.condominioId,
    );
    revalidatePath("/mi-cuenta", "layout");
    hecha = { id: r.reserva.id, espacioId: r.espacio.id, dia: datos.data.dia, unidadId: unidad.id };
  } catch (e) {
    if (e instanceof ErrorReserva) return { mensaje: e.message };
    throw e;
  }
  // Se vuelve a cargar la página con el mensaje: si el día quedó lleno, el formulario ya no aparece.
  const unidadParam = aTexto(formData.get("unidadParam"));
  redirect(
    `/mi-cuenta/reservas?espacio=${hecha.espacioId}&dia=${hecha.dia}&hecha=${hecha.id}${unidadParam ? `&unidad=${encodeURIComponent(unidadParam)}` : ""}`,
  );
}

export async function cancelarMiReserva(id: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const { usuario, unidades } = await residente();
  if (!usuario.administradoraId) return { mensaje: "Reserva no encontrada." };
  const motivo = aTexto(formData.get("motivo"))?.slice(0, 300);
  try {
    const { reserva, cargoQuitado } = await cancelarReserva(id, usuario.administradoraId, {
      por: usuario.nombre,
      motivo,
      porAdministracion: false,
      hoy: hoyChile(),
      unidadesPermitidas: unidades.map((u) => u.id),
    });
    await registrar(
      usuario,
      "Canceló su reserva",
      `${reserva.espacio.nombre}, ${formatoDia(reserva.fecha)} (${reserva.turno}), unidad ${reserva.unidad.numero}${motivo ? `. Motivo: ${motivo}` : ""}`,
      reserva.condominioId,
    );
    revalidatePath("/mi-cuenta", "layout");
    return { ok: true, mensaje: cargoQuitado ? "Reserva cancelada. También se quitó su cobro." : "Reserva cancelada." };
  } catch (e) {
    if (e instanceof ErrorReserva) return { mensaje: e.message };
    throw e;
  }
}
