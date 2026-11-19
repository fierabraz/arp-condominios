"use server";

// FIN-COMP · Entrega D · Remuneraciones básicas: personal de la comunidad y carga mensual.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdministradora } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { db } from "@/lib/db";
import { registrar } from "@/lib/registro";
import { aTexto, erroresDe, type EstadoForm } from "@/lib/forms";
import { leerMonto } from "@/lib/apertura";
import { cargarRemuneraciones, ErrorRemuneracion } from "@/lib/remuneraciones-servicio";
import { formatoMoneda } from "@/lib/formato";

async function admin(condominioId: string) {
  const { usuario, administradoraId } = await requireAdministradora("propiedad.administrar");
  if (!puede(usuario, "propiedad.administrar", condominioId)) return null;
  const c = await db.condominio.findFirst({ where: { id: condominioId, administradoraId }, select: { id: true } });
  return c ? { usuario, administradoraId } : null;
}

const monto = (v: FormDataEntryValue | null) => {
  const t = aTexto(v);
  return t === undefined ? undefined : (leerMonto(t) ?? Number.NaN);
};
const TrabajadorSchema = z.object({
  nombre: z.string({ error: "Escribe el nombre." }).trim().min(2, { error: "Escribe el nombre." }).max(120),
  cargo: z.string({ error: "Escribe el cargo." }).trim().min(2, { error: "Escribe el cargo (conserje, aseo…)." }).max(80),
  liquido: z.number({ error: "Escribe el sueldo líquido." }).gt(0, { error: "Debe ser mayor que 0." }).max(100_000_000),
  imposiciones: z.number({ error: "Monto no válido." }).min(0, { error: "No puede ser negativo." }).max(100_000_000).optional(),
});

export async function crearTrabajadorAccion(condominioId: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const a = await admin(condominioId);
  if (!a) return { mensaje: "Propiedad no encontrada." };
  const d = TrabajadorSchema.safeParse({
    nombre: aTexto(formData.get("nombre")),
    cargo: aTexto(formData.get("cargo")),
    liquido: monto(formData.get("liquido")),
    imposiciones: monto(formData.get("imposiciones")),
  });
  if (!d.success) return erroresDe(d.error);
  await db.trabajador.create({ data: { ...d.data, imposiciones: d.data.imposiciones ?? 0, administradoraId: a.administradoraId, condominioId, creadoPor: a.usuario.nombre } });
  await registrar(a.usuario, "Agregó un trabajador", `${d.data.cargo}: líquido ${formatoMoneda(d.data.liquido)}, imposiciones ${formatoMoneda(d.data.imposiciones ?? 0)}`, condominioId);
  revalidatePath(`/condominios/${condominioId}/remuneraciones`);
  return { ok: true, mensaje: "Trabajador agregado." };
}

export async function cambiarTrabajadorAccion(condominioId: string, trabajadorId: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const a = await admin(condominioId);
  if (!a) return { mensaje: "Propiedad no encontrada." };
  const t = await db.trabajador.findFirst({ where: { id: trabajadorId, condominioId, administradoraId: a.administradoraId } });
  if (!t) return { mensaje: "Trabajador no encontrado." };
  if (formData.get("activo") !== null) {
    const activo = formData.get("activo") === "1";
    await db.trabajador.update({ where: { id: t.id }, data: { activo } });
    await registrar(a.usuario, activo ? "Reactivó un trabajador" : "Dio de baja a un trabajador", t.cargo, condominioId);
  } else {
    const d = TrabajadorSchema.pick({ liquido: true, imposiciones: true }).safeParse({ liquido: monto(formData.get("liquido")), imposiciones: monto(formData.get("imposiciones")) });
    if (!d.success) return erroresDe(d.error);
    await db.trabajador.update({ where: { id: t.id }, data: { liquido: d.data.liquido, imposiciones: d.data.imposiciones ?? 0 } });
    await registrar(
      a.usuario,
      "Cambió los montos de un trabajador",
      `${t.cargo}: líquido ${formatoMoneda(t.liquido)} → ${formatoMoneda(d.data.liquido)}, imposiciones ${formatoMoneda(t.imposiciones)} → ${formatoMoneda(d.data.imposiciones ?? 0)}`,
      condominioId,
    );
  }
  revalidatePath(`/condominios/${condominioId}/remuneraciones`);
  return { ok: true, mensaje: "Guardado." };
}

export async function cargarRemuneracionesAccion(condominioId: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const a = await admin(condominioId);
  if (!a) return { mensaje: "Propiedad no encontrada." };
  const periodoId = String(formData.get("periodoId") ?? "");
  const p = await db.periodo.findFirst({ where: { id: periodoId, condominioId, administradoraId: a.administradoraId }, select: { id: true } });
  if (!p) return { mensaje: "Elige el mes." };
  try {
    const r = await cargarRemuneraciones(a.usuario, p.id);
    revalidatePath(`/condominios/${condominioId}`, "layout");
    return { ok: true, mensaje: `Cargadas ${r.cargados} remuneración(es) por ${formatoMoneda(r.total)} como egresos por pagar.${r.omitidos ? ` ${r.omitidos} ya estaban cargadas.` : ""}` };
  } catch (e) {
    if (e instanceof ErrorRemuneracion) return { mensaje: e.message };
    throw e;
  }
}
