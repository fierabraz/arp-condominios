"use server";

// SUS-001: planes (nombres y cupos editables) y plan de cada administradora. Solo la plataforma.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermiso } from "@/lib/auth";
import { aNumero, aTexto, erroresDe, type EstadoForm } from "@/lib/forms";
import { registrar } from "@/lib/registro";
import { textoCupo } from "@/lib/planes";
import { cupoDe } from "@/lib/planes-servicio";

const PlanSchema = z.object({
  nombre: z.string({ error: "Ingresa el nombre." }).min(2, { error: "Ingresa el nombre." }).max(60, { error: "Máximo 60 caracteres." }),
  descripcion: z.string().max(300, { error: "Máximo 300 caracteres." }).optional(),
  maxComunidades: z
    .number({ error: "Ingresa un número entero o déjalo vacío (sin límite)." })
    .int({ error: "Ingresa un número entero." })
    .min(0, { error: "No puede ser negativo." })
    .max(100000, { error: "Máximo 100.000." })
    .nullable(),
  orden: z.number({ error: "Ingresa un número." }).int().min(0).max(1000),
  activo: z.boolean(),
});

function leerPlan(formData: FormData) {
  return PlanSchema.safeParse({
    nombre: aTexto(formData.get("nombre")),
    descripcion: aTexto(formData.get("descripcion")),
    maxComunidades: aNumero(formData.get("maxComunidades")) ?? null,
    orden: aNumero(formData.get("orden")) ?? 0,
    activo: formData.get("activo") === "on",
  });
}

const textoLimite = (n: number | null) => (n === null ? "sin límite" : `${n} comunidades`);

async function nombreLibre(nombre: string, excepto?: string) {
  const otro = await db.plan.findFirst({ where: { nombre: { equals: nombre, mode: "insensitive" }, NOT: excepto ? { id: excepto } : undefined } });
  return !otro;
}

export async function crearPlan(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  await requirePermiso("plataforma");
  const datos = leerPlan(formData);
  if (!datos.success) return erroresDe(datos.error);
  const d = datos.data;
  if (!(await nombreLibre(d.nombre))) return { errores: { nombre: ["Ya hay un plan con ese nombre."] } };
  await db.plan.create({ data: { ...d, descripcion: d.descripcion ?? null } });
  revalidatePath("/plataforma", "layout");
  return { ok: true, mensaje: `Plan ${d.nombre} creado (${textoLimite(d.maxComunidades)}).` };
}

export async function editarPlan(id: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const yo = await requirePermiso("plataforma");
  const datos = leerPlan(formData);
  if (!datos.success) return erroresDe(datos.error);
  const d = datos.data;
  const antes = await db.plan.findUnique({ where: { id }, include: { administradoras: { select: { id: true } } } });
  if (!antes) return { mensaje: "Plan no encontrado." };
  if (!(await nombreLibre(d.nombre, id))) return { errores: { nombre: ["Ya hay un plan con ese nombre."] } };
  await db.plan.update({ where: { id }, data: { ...d, descripcion: d.descripcion ?? null } });
  // Cada administradora con este plan ve en su registro si le cambió el cupo.
  if (antes.maxComunidades !== d.maxComunidades || antes.nombre !== d.nombre) {
    for (const a of antes.administradoras) {
      await registrar(
        { ...yo, administradoraId: a.id },
        "La plataforma cambió el plan",
        `Plan ${antes.nombre} → ${d.nombre}: ${textoLimite(antes.maxComunidades)} → ${textoLimite(d.maxComunidades)}`,
      );
    }
  }
  revalidatePath("/plataforma", "layout");
  return { ok: true, mensaje: "Plan guardado." };
}

export async function asignarPlan(administradoraId: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const yo = await requirePermiso("plataforma");
  const planId = aTexto(formData.get("planId")) ?? null;
  const creaComunidades = formData.get("creaComunidades") === "on";
  const antes = await db.administradora.findUnique({ where: { id: administradoraId }, include: { plan: true } });
  if (!antes) return { mensaje: "Administradora no encontrada." };
  const plan = planId ? await db.plan.findUnique({ where: { id: planId } }) : null;
  if (planId && !plan) return { errores: { planId: ["Elige un plan de la lista."] } };

  await db.administradora.update({ where: { id: administradoraId }, data: { planId, creaComunidades } });
  const cupo = await cupoDe(administradoraId);
  await registrar(
    { ...yo, administradoraId },
    "La plataforma cambió el plan de la administradora",
    `${antes.plan?.nombre ?? "Sin plan"} → ${plan?.nombre ?? "Sin plan"}; crear comunidades: ${creaComunidades ? "sí" : "no"}; uso ${textoCupo(cupo)}`,
  );
  revalidatePath("/plataforma", "layout");
  // Bajar de plan nunca borra comunidades: solo impide crear nuevas.
  const aviso =
    cupo.limite !== null && cupo.usadas > cupo.limite
      ? ` Ojo: ya tiene ${cupo.usadas} comunidades, más que el límite del plan (${cupo.limite}). No se borra ninguna; solo no podrá crear nuevas.`
      : "";
  return { ok: true, mensaje: `Guardado. Uso: ${textoCupo(cupo)} comunidades.${aviso}` };
}
