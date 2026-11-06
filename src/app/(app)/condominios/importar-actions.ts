"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { puedeVerPropiedad, requireAdministradora } from "@/lib/auth";
import { db } from "@/lib/db";
import type { EstadoForm } from "@/lib/forms";
import { registrar } from "@/lib/registro";
import {
  COLUMNAS,
  columnaDe,
  hayCambios,
  normalizarTitulo,
  resumenPlan,
  revisarMapeo,
  type ColumnaLeida,
  type Destino,
  type ErrorFila,
  type FilaImportada,
  type Mapeo,
  type Plan,
} from "@/lib/importacion";
import {
  aplicarImportacion,
  leerArchivo,
  leerHoja,
  MAXIMO_FILAS,
  planDe,
  type HojaLeida,
  type LecturaArchivo,
} from "@/lib/importacion-servicio";

/** Datos de la hoja que viajan a la pantalla para asignar columnas sin volver a subir el archivo. */
type DatosHoja = {
  archivo: string;
  /** La hoja (JSON), o undefined si es muy grande para mandarla de vuelta. */
  hoja?: string;
  nombreHoja: string;
  columnas: ColumnaLeida[];
  /** Perfil de la administradora que se aplicó solo. */
  perfil?: string;
  /** Total de unidades escrito al subir, para no perderlo entre pasos. */
  totalEscrito?: string;
};

export type EstadoImportacion =
  | { etapa: "inicio"; errores?: ErrorFila[] }
  | ({ etapa: "columnas"; errores?: ErrorFila[] } & DatosHoja)
  | ({
      etapa: "revision";
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
    } & DatosHoja)
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

/** Más que esto no cabe de vuelta en el formulario (las acciones aceptan hasta 1 MB). */
const HOJA_MAXIMA = 900 * 1024;

function datosHoja(archivo: string, lectura: LecturaArchivo, totalEscrito: string): DatosHoja {
  const hoja = lectura.hoja ? JSON.stringify(lectura.hoja) : undefined;
  return {
    archivo,
    hoja: hoja && hoja.length <= HOJA_MAXIMA ? hoja : undefined,
    nombreHoja: lectura.hoja?.nombre ?? archivo,
    columnas: lectura.columnas ?? [],
    perfil: lectura.perfil?.nombre,
    totalEscrito: totalEscrito || undefined,
  };
}

/** "Hoja Unidades, fila 4: …" para encontrar el error en Excel. */
const conHoja = (errores: ErrorFila[], hoja: string) => errores.map((e) => ({ ...e, hoja: e.hoja ?? hoja }));

/** Con las filas leídas, arma la revisión: qué se crea y qué cambia, sin guardar nada. */
async function revision(
  acceso: NonNullable<Awaited<ReturnType<typeof propiedad>>>,
  condominioId: string,
  lectura: LecturaArchivo,
  datos: DatosHoja,
  total: number | null,
): Promise<EstadoImportacion> {
  if (lectura.sinTitulos) {
    return { etapa: "columnas", ...datos, errores: datos.hoja ? undefined : lectura.errores };
  }
  if (lectura.filas.length === 0) {
    return {
      etapa: "inicio",
      errores: lectura.errores.length ? lectura.errores : [{ fila: 0, mensaje: "La planilla no tiene filas con unidades." }],
    };
  }
  const plan = await planDe(lectura.filas, condominioId, acceso.administradoraId);
  return {
    etapa: "revision",
    ...datos,
    plan,
    errores: conHoja([...lectura.errores, ...plan.errores], datos.nombreHoja).sort((a, b) => a.fila - b.fila),
    avisos: lectura.avisos,
    filas: JSON.stringify(lectura.filas),
    hayCambios: hayCambios(plan),
    totalPropiedad: total ?? acceso.totalUnidades,
    totalNuevo: total !== null && total !== acceso.totalUnidades,
  };
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
  // El archivo se lee en memoria y no se guarda en ninguna parte.
  const lectura = await leerArchivo(archivo, acceso.administradoraId);
  const datos = datosHoja(archivo.name, lectura, String(formData.get("totalUnidades") ?? "").trim());
  return revision(acceso, condominioId, lectura, datos, total.total);
}

const DESTINOS = new Set<string>([...COLUMNAS.map((c) => c.clave), "ignorar"]);
const HojaSchema = z.object({
  nombre: z.string().max(300),
  datos: z.array(z.array(z.union([z.string().max(500), z.number(), z.null()])).max(60)).max(MAXIMO_FILAS + 20),
});
const NombrePerfil = z.string().trim().min(2, { error: "Ponle un nombre de al menos 2 letras." }).max(60, { error: "El nombre puede tener hasta 60 letras." });

/**
 * Asignar columnas a mano (planilla propia): cada título de columna → un dato de Convive.
 * Opcionalmente se guarda como perfil de la administradora para que la próxima vez se aplique solo.
 */
export async function asignarColumnas(condominioId: string, _: EstadoImportacion, formData: FormData): Promise<EstadoImportacion> {
  const acceso = await propiedad(condominioId);
  if (!acceso) return { etapa: "inicio", errores: [{ fila: 0, mensaje: "Propiedad no encontrada." }] };
  const total = leerTotal(formData);
  if (!total.ok) return { etapa: "inicio", errores: [{ fila: 0, mensaje: total.mensaje }] };
  let hoja: HojaLeida;
  try {
    const d = HojaSchema.safeParse(JSON.parse(String(formData.get("hoja") ?? "")));
    if (!d.success) throw new Error();
    hoja = d.data;
  } catch {
    return { etapa: "inicio", errores: [{ fila: 0, mensaje: "No pude leer la planilla. Súbela otra vez." }] };
  }
  const archivo = String(formData.get("archivo") ?? "planilla").slice(0, 200);
  const totalEscrito = String(formData.get("totalUnidades") ?? "").trim();

  // Un select por columna: "col:<título normalizado>" → dato.
  const mapeo: Mapeo = {};
  for (const [k, v] of formData.entries()) {
    if (!k.startsWith("col:") || typeof v !== "string") continue;
    const titulo = normalizarTitulo(k.slice(4));
    if (titulo && DESTINOS.has(v)) mapeo[titulo] = v as Destino;
  }
  const lectura: LecturaArchivo = { ...leerHoja(hoja, mapeo), hoja };
  const datos = datosHoja(archivo, lectura, totalEscrito);
  const error = revisarMapeo(mapeo);
  if (error) return { etapa: "columnas", ...datos, errores: [{ fila: 0, mensaje: error }] };

  const guardar = formData.get("guardarPerfil") === "on";
  if (guardar) {
    const nombre = NombrePerfil.safeParse(formData.get("nombrePerfil") ?? "");
    if (!nombre.success) return { etapa: "columnas", ...datos, errores: [{ fila: 0, mensaje: nombre.error.issues[0].message }] };
    // Se guardan las columnas asignadas a un dato (y las ignoradas que Convive reconocería sola),
    // así el perfil calza aunque la próxima planilla traiga otras columnas.
    const columnas = Object.fromEntries(Object.entries(mapeo).filter(([t, d]) => d !== "ignorar" || columnaDe(t)));
    await db.perfilImportacion.upsert({
      where: { administradoraId_nombre: { administradoraId: acceso.administradoraId, nombre: nombre.data } },
      create: { administradoraId: acceso.administradoraId, nombre: nombre.data, columnas, creadoPor: acceso.usuario.nombre },
      update: { columnas, creadoPor: acceso.usuario.nombre },
    });
    await registrar(
      acceso.usuario,
      "Guardó un perfil de planilla",
      `${nombre.data}: ${Object.entries(columnas)
        .map(([t, d]) => `${t} → ${d === "ignorar" ? "no se usa" : COLUMNAS.find((c) => c.clave === d)!.titulo}`)
        .join(", ")}`,
      condominioId,
    );
    datos.perfil = nombre.data;
    revalidatePath(`/condominios/${condominioId}/importar`);
  }
  return revision(acceso, condominioId, lectura, datos, total.total);
}

/** Borra un perfil de planilla de la administradora (no toca nada de lo ya cargado). */
export async function eliminarPerfil(condominioId: string, perfilId: string): Promise<EstadoForm> {
  const acceso = await propiedad(condominioId);
  if (!acceso) return { mensaje: "Propiedad no encontrada." };
  const perfil = await db.perfilImportacion.findFirst({ where: { id: perfilId, administradoraId: acceso.administradoraId } });
  if (!perfil) return { mensaje: "Ese perfil ya no existe." };
  await db.perfilImportacion.delete({ where: { id: perfil.id } });
  await registrar(acceso.usuario, "Eliminó un perfil de planilla", perfil.nombre, condominioId);
  revalidatePath(`/condominios/${condominioId}/importar`);
  return { ok: true };
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
      relaciones: z.array(z.enum(["PROPIETARIO", "COPROPIETARIO", "ARRENDATARIO", "RESIDENTE", "OCUPANTE"])).max(5),
      desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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
