"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { puedeVerPropiedad, requireAdministradora } from "@/lib/auth";
import { db } from "@/lib/db";
import { registrar } from "@/lib/registro";
import { hayCambios, resumenPlan, type ErrorFila, type FilaImportada, type Plan } from "@/lib/importacion";
import { aplicarImportacion, leerArchivo, MAXIMO_FILAS, planDe } from "@/lib/importacion-servicio";

export type EstadoImportacion =
  | { etapa: "inicio"; errores?: ErrorFila[] }
  | {
      etapa: "revision";
      archivo: string;
      plan: Plan;
      errores: ErrorFila[];
      avisos: string[];
      /** Filas leídas, para confirmar sin volver a subir el archivo. */
      filas: string;
      hayCambios: boolean;
      /** Total de unidades de la propiedad: el ya guardado o el que se indicó al subir la planilla. */
      totalPropiedad: number | null;
      /** true si el total se indicó recién y se guardará al confirmar. */
      totalNuevo: boolean;
    }
  | {
      etapa: "listo";
      resumen: ReturnType<typeof resumenPlan>;
      sumaAlicuotas: number;
      totalUnidades: number;
      totalPropiedad: number | null;
    };

async function propiedad(condominioId: string) {
  const { usuario, administradoraId } = await requireAdministradora();
  const condominio = await db.condominio.findFirst({
    where: { id: condominioId, administradoraId },
    select: { id: true, totalUnidades: true },
  });
  return condominio && puedeVerPropiedad(usuario, condominioId) ? { usuario, administradoraId, totalUnidades: condominio.totalUnidades } : null;
}

const TotalSchema = z.coerce
  .number({ error: "Escribe cuántas unidades tiene la propiedad, con un número entero." })
  .int({ error: "Escribe cuántas unidades tiene la propiedad, con un número entero." })
  .min(1, { error: "La cantidad total de unidades debe ser al menos 1." })
  .max(10000, { error: "La cantidad total de unidades no puede pasar de 10.000." });

/** Lee el total de unidades que se escribió en el formulario (vacío = no se indicó). */
function leerTotal(formData: FormData): { ok: true; total: number | null } | { ok: false; mensaje: string } {
  const valor = String(formData.get("totalUnidades") ?? "").trim();
  if (!valor) return { ok: true, total: null };
  const datos = TotalSchema.safeParse(valor);
  return datos.success ? { ok: true, total: datos.data } : { ok: false, mensaje: datos.error.issues[0].message };
}

/** Paso 1: leer la planilla y mostrar qué se va a cargar, sin guardar nada. */
export async function revisarPlanilla(condominioId: string, _: EstadoImportacion, formData: FormData): Promise<EstadoImportacion> {
  const acceso = await propiedad(condominioId);
  if (!acceso) return { etapa: "inicio", errores: [{ fila: 0, mensaje: "Propiedad no encontrada." }] };
  const total = leerTotal(formData);
  if (!total.ok) return { etapa: "inicio", errores: [{ fila: 0, mensaje: total.mensaje }] };
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { etapa: "inicio", errores: [{ fila: 0, mensaje: "Elige el archivo de la planilla." }] };
  }
  const lectura = await leerArchivo(archivo);
  if (lectura.filas.length === 0) {
    return {
      etapa: "inicio",
      errores: lectura.errores.length ? lectura.errores : [{ fila: 0, mensaje: "La planilla no tiene filas con unidades." }],
    };
  }
  const plan = await planDe(lectura.filas, condominioId, acceso.administradoraId);
  return {
    etapa: "revision",
    archivo: archivo.name,
    plan,
    errores: [...lectura.errores, ...plan.errores].sort((a, b) => a.fila - b.fila),
    avisos: lectura.avisos,
    filas: JSON.stringify(lectura.filas),
    hayCambios: hayCambios(plan),
    totalPropiedad: total.total ?? acceso.totalUnidades,
    totalNuevo: total.total !== null && total.total !== acceso.totalUnidades,
  };
}

const TIPOS = ["DEPARTAMENTO", "CASA", "OFICINA", "LOCAL", "ESTACIONAMIENTO", "BODEGA"] as const;
const texto = z.string().trim().min(1).max(200).optional();
const FilasSchema = z
  .array(
    z.object({
      fila: z.number().int(),
      numero: z.string().trim().min(1).max(50),
      tipo: z.enum(TIPOS).optional(),
      alicuota: z.number().gt(0).max(100).optional(),
      nombre: texto,
      documento: texto,
      correo: z.email().max(200).optional(),
      telefono: texto,
      relaciones: z.array(z.enum(["PROPIETARIO", "RESIDENTE"])).max(2),
    }),
  )
  .min(1)
  .max(MAXIMO_FILAS);

/** Paso 2: cargar lo revisado. Las filas con error no se cargan: hay que corregirlas antes. */
export async function confirmarImportacion(condominioId: string, _: EstadoImportacion, formData: FormData): Promise<EstadoImportacion> {
  const acceso = await propiedad(condominioId);
  if (!acceso) return { etapa: "inicio", errores: [{ fila: 0, mensaje: "Propiedad no encontrada." }] };
  const total = leerTotal(formData);
  if (!total.ok) return { etapa: "inicio", errores: [{ fila: 0, mensaje: total.mensaje }] };
  let filas: FilaImportada[];
  try {
    const datos = FilasSchema.safeParse(JSON.parse(String(formData.get("filas") ?? "")));
    if (!datos.success) throw new Error();
    filas = datos.data;
  } catch {
    return { etapa: "inicio", errores: [{ fila: 0, mensaje: "No pude leer la planilla revisada. Súbela otra vez." }] };
  }
  try {
    const r = await aplicarImportacion(acceso.usuario, acceso.administradoraId, condominioId, filas);
    if (!r.ok) {
      return {
        etapa: "inicio",
        errores: [{ fila: 0, mensaje: "Algo cambió desde la revisión y ahora hay filas con problemas. Sube la planilla otra vez." }],
      };
    }
    if (total.total !== null && total.total !== acceso.totalUnidades) {
      const c = await db.condominio.update({ where: { id: condominioId }, data: { totalUnidades: total.total } });
      await registrar(acceso.usuario, "Indicó el total de unidades de una propiedad", `${c.nombre}: ${total.total} unidades`, condominioId);
    }
    revalidatePath(`/condominios/${condominioId}`, "layout");
    revalidatePath("/personas");
    return {
      etapa: "listo",
      resumen: r.resumen,
      sumaAlicuotas: r.plan.sumaAlicuotas,
      totalUnidades: r.plan.totalUnidades,
      totalPropiedad: total.total ?? acceso.totalUnidades,
    };
  } catch (e) {
    console.error("Error al importar planilla:", e);
    return {
      etapa: "inicio",
      errores: [{ fila: 0, mensaje: "No se pudo completar la carga y no se guardó nada. Inténtalo de nuevo en un momento." }],
    };
  }
}
