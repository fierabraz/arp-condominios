import "server-only";
import { randomUUID } from "node:crypto";
import readXlsxFile from "read-excel-file/node";
import { db } from "@/lib/db";
import type { UsuarioActual } from "@/lib/auth";
import { hoyDia } from "@/lib/estructura";
import { relacionDe } from "@/lib/vinculos";
import {
  leerCsv,
  leerPlanilla,
  perfilQueCalza,
  planificar,
  resumenPlan,
  type FilaImportada,
  type Lectura,
  type Mapeo,
  type Tipo,
} from "@/lib/importacion";
import { registrar } from "@/lib/registro";

export const MAXIMO_FILAS = 3000;
/** Bajo el límite de 1 MB que tienen las acciones del servidor. */
export const TAMANO_MAXIMO = 900 * 1024;
/** Un .xlsx es un zip: más de esto descomprimido no es una planilla normal (posible "bomba zip"). */
const DESCOMPRIMIDO_MAXIMO = 25 * 1024 * 1024;
const MAXIMO_HOJAS = 20;
const MAXIMO_COLUMNAS = 60;

/** Tamaño descomprimido declarado en el índice del zip (sin descomprimir nada). null si no es un zip válido. */
export function tamanoDescomprimido(zip: Buffer): number | null {
  // Fin del directorio central: firma 0x06054b50, en los últimos 64 KB.
  const desde = Math.max(0, zip.length - 65_557);
  let fin = -1;
  for (let i = zip.length - 22; i >= desde; i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin === -1) return null;
  const entradas = zip.readUInt16LE(fin + 10);
  let pos = zip.readUInt32LE(fin + 16);
  let total = 0;
  for (let n = 0; n < entradas; n++) {
    if (pos + 46 > zip.length || zip.readUInt32LE(pos) !== 0x02014b50) return null;
    total += zip.readUInt32LE(pos + 24);
    pos += 46 + zip.readUInt16LE(pos + 28) + zip.readUInt16LE(pos + 30) + zip.readUInt16LE(pos + 32);
  }
  return total;
}

/** Celdas como texto, número o fecha "AAAA-MM-DD", con un máximo de filas y columnas. */
const limpiarHoja = (hoja: unknown[][]): (string | number | null)[][] =>
  hoja.slice(0, MAXIMO_FILAS + 20).map((fila) =>
    fila.slice(0, MAXIMO_COLUMNAS).map((c) => {
      if (c === null || c === undefined) return null;
      if (typeof c === "number") return Number.isFinite(c) ? c : null;
      if (c instanceof Date) return Number.isNaN(c.getTime()) ? null : c.toISOString().slice(0, 10);
      return String(c).slice(0, 500);
    }),
  );

export type HojaLeida = { nombre: string; datos: (string | number | null)[][] };
export type LecturaArchivo = Lectura & {
  /** La hoja usada, para asignar columnas a mano sin volver a subir el archivo. */
  hoja?: HojaLeida;
  /** Perfil de columnas de la administradora que se aplicó. */
  perfil?: { id: string; nombre: string };
};

/**
 * Abre un .xlsx o .csv subido, con controles de seguridad: tamaño, tipo real del archivo (no solo
 * la extensión), tamaño descomprimido y cantidad de hojas. El archivo no se guarda: solo se leen
 * los valores de las celdas (las fórmulas no se ejecutan; se toma el último valor que guardó Excel).
 */
export async function abrirArchivo(archivo: File): Promise<{ ok: true; hojas: HojaLeida[] } | { ok: false; mensaje: string }> {
  const nombre = archivo.name.toLowerCase();
  const error = (mensaje: string) => ({ ok: false as const, mensaje });
  if (archivo.size === 0) return error("Elige un archivo.");
  if (archivo.size > TAMANO_MAXIMO) return error("El archivo pesa más de 900 KB. Divide la planilla en partes más chicas.");
  const contenido = Buffer.from(await archivo.arrayBuffer());

  if (nombre.endsWith(".csv") || nombre.endsWith(".txt")) {
    if (contenido.includes(0)) return error("Ese archivo no es un CSV de texto. Guárdalo desde Excel como CSV o súbelo como .xlsx.");
    // Excel en Windows guarda los CSV en Windows-1252: si no es UTF-8 válido, se lee así.
    let texto = new TextDecoder("utf-8").decode(contenido);
    if (texto.includes("\uFFFD")) texto = new TextDecoder("windows-1252").decode(contenido);
    return { ok: true, hojas: [{ nombre: archivo.name, datos: limpiarHoja(leerCsv(texto)) }] };
  }
  if (nombre.endsWith(".xls")) {
    return error('Ese es el formato antiguo de Excel (.xls). En Excel usa "Guardar como" y elige "Libro de Excel (.xlsx)".');
  }
  if (!nombre.endsWith(".xlsx")) return error("Sube una planilla de Excel (.xlsx) o un archivo .csv.");
  // Un .xlsx de verdad es un zip: empieza con "PK".
  if (contenido.length < 4 || contenido.readUInt32LE(0) !== 0x04034b50) {
    return error("Ese archivo no es una planilla de Excel aunque termine en .xlsx. Ábrelo en Excel y guárdalo de nuevo.");
  }
  const descomprimido = tamanoDescomprimido(contenido);
  if (descomprimido === null) return error("No pude abrir el archivo. Revisa que sea una planilla de Excel (.xlsx).");
  if (descomprimido > DESCOMPRIMIDO_MAXIMO) return error("La planilla es demasiado grande por dentro. Divídela en partes más chicas.");
  try {
    const hojas = await readXlsxFile(contenido);
    if (hojas.length > MAXIMO_HOJAS) return error(`La planilla tiene más de ${MAXIMO_HOJAS} hojas. Deja solo las que se van a cargar.`);
    return { ok: true, hojas: hojas.map((h) => ({ nombre: h.sheet, datos: limpiarHoja(h.data as unknown[][]) })) };
  } catch {
    return error("No pude abrir el archivo. Revisa que sea una planilla de Excel (.xlsx).");
  }
}

const hoyISO = () => hoyDia().toISOString().slice(0, 10);

/** Lee una hoja con una asignación de columnas (a mano o de un perfil). */
export function leerHoja(hoja: HojaLeida, mapeo?: Mapeo): Lectura {
  const lectura = leerPlanilla(hoja.datos, { mapeo, hoja: hoja.nombre, hoy: hoyISO() });
  if (lectura.filas.length > MAXIMO_FILAS) {
    return { filas: [], errores: [{ fila: 0, mensaje: `La planilla tiene más de ${MAXIMO_FILAS} filas. Divídela en partes.` }], avisos: [] };
  }
  return lectura;
}

/**
 * Elige la hoja a cargar: la primera que se entienda (por sus títulos o por un perfil guardado de
 * la administradora). Si ninguna se entiende, devuelve la que tiene más columnas, para asignarlas a mano.
 */
export async function leerArchivo(archivo: File, administradoraId?: string): Promise<LecturaArchivo> {
  const abierto = await abrirArchivo(archivo);
  if (!abierto.ok) return { filas: [], errores: [{ fila: 0, mensaje: abierto.mensaje }], avisos: [] };
  const perfiles = administradoraId
    ? (await db.perfilImportacion.findMany({ where: { administradoraId }, select: { id: true, nombre: true, columnas: true } })).map(
        (p) => ({ ...p, columnas: p.columnas as Mapeo }),
      )
    : [];
  let primera: LecturaArchivo | undefined;
  for (const hoja of abierto.hojas) {
    if (hoja.datos.every((f) => f.every((c) => c === null || c === ""))) continue;
    const perfil = perfilQueCalza(hoja.datos, perfiles);
    const lectura: LecturaArchivo = { ...leerHoja(hoja, perfil?.columnas), hoja, perfil: perfil ? { id: perfil.id, nombre: perfil.nombre } : undefined };
    if (!lectura.sinTitulos) return lectura;
    // Para asignar a mano, la hoja con más columnas (no una portada con un solo título).
    if (!primera || (lectura.columnas?.length ?? 0) > (primera.columnas?.length ?? 0)) primera = lectura;
  }
  return primera ?? { filas: [], errores: [{ fila: 0, mensaje: "La planilla está vacía." }], avisos: [] };
}

/** Lo que ya existe en la propiedad (unidades y sus vínculos) y en la administradora (personas). */
export async function existentes(condominioId: string, administradoraId: string) {
  const [unidades, personas, vinculos] = await Promise.all([
    db.unidad.findMany({
      where: { condominioId, administradoraId },
      select: { id: true, numero: true, tipo: true, alicuota: true },
    }),
    db.persona.findMany({
      where: { administradoraId },
      select: { id: true, nombre: true, documento: true, correo: true, telefono: true },
    }),
    // Vínculos vigentes (Entrega 3): con ellos se ve qué es nuevo y qué contradice lo que ya hay.
    db.vinculoUnidad.findMany({
      where: { hasta: null, unidad: { condominioId, administradoraId } },
      select: { unidadId: true, personaId: true, tipo: true },
    }),
  ]);
  return {
    unidades: unidades.map((u) => ({ ...u, alicuota: Number(u.alicuota) })),
    personas,
    vinculos: vinculos.map((v) => ({ unidadId: v.unidadId, personaId: v.personaId, relacion: v.tipo })),
  };
}

export async function planDe(filas: FilaImportada[], condominioId: string, administradoraId: string) {
  return planificar(filas, await existentes(condominioId, administradoraId));
}

/**
 * Aplica la carga en una sola transacción: o se carga todo, o nada. El plan se vuelve a
 * calcular con los datos de este momento (no se confía en lo que mostró la vista previa).
 */
export async function aplicarImportacion(
  autor: UsuarioActual,
  administradoraId: string,
  condominioId: string,
  filas: FilaImportada[],
) {
  const plan = await planDe(filas, condominioId, administradoraId);
  if (plan.errores.length) return { ok: false as const, plan };

  const idUnidad = new Map<string, string>();
  const nuevasUnidades = plan.unidades
    .filter((u) => u.accion === "crear")
    .map((u) => {
      const id = randomUUID();
      idUnidad.set(u.numero, id);
      return { id, administradoraId, condominioId, numero: u.numero, tipo: u.tipo as Tipo, alicuota: u.alicuota };
    });
  for (const u of plan.unidades) if (u.id) idUnidad.set(u.numero, u.id);

  const idPersona = new Map<string, string>();
  const nuevasPersonas = plan.personas
    .filter((p) => p.accion === "crear")
    .map((p) => {
      const id = randomUUID();
      idPersona.set(p.clave, id);
      return { id, administradoraId, nombre: p.nombre, documento: p.documento, correo: p.correo, telefono: p.telefono };
    });
  for (const p of plan.personas) if (p.id) idPersona.set(p.clave, p.id);

  const vinculos = plan.vinculos
    .filter((v) => v.nuevo)
    .map((v) => ({
      unidadId: idUnidad.get(v.numero)!,
      personaId: idPersona.get(v.persona)!,
      tipo: v.relacion,
      desde: v.desde ? new Date(`${v.desde}T00:00:00Z`) : null,
    }));
  // La foto de hoy (UnidadPersona) que usan cobros, votaciones y la app; el ocupante no da relación.
  const relaciones = vinculos.flatMap((v) => {
    const relacion = relacionDe(v.tipo);
    return relacion ? [{ unidadId: v.unidadId, personaId: v.personaId, relacion }] : [];
  });

  await db.$transaction(
    async (tx) => {
      if (nuevasUnidades.length) await tx.unidad.createMany({ data: nuevasUnidades });
      for (const u of plan.unidades.filter((u) => u.accion === "actualizar")) {
        await tx.unidad.update({ where: { id: u.id }, data: { tipo: u.tipo, alicuota: u.alicuota } });
      }
      if (nuevasPersonas.length) await tx.persona.createMany({ data: nuevasPersonas });
      for (const p of plan.personas.filter((p) => p.accion === "completar")) {
        await tx.persona.update({ where: { id: p.id }, data: p.completar! });
      }
      if (vinculos.length) {
        // COM-001: el historial de vínculos manda; sin fecha en la planilla queda "sin fecha registrada".
        await tx.vinculoUnidad.createMany({
          data: vinculos.map((v) => ({ ...v, administradoraId, creadoPor: `${autor.nombre} (carga desde planilla)` })),
        });
        if (relaciones.length) await tx.unidadPersona.createMany({ data: relaciones, skipDuplicates: true });
      }
    },
    { timeout: 30_000, maxWait: 10_000 },
  );

  const r = resumenPlan(plan);
  await registrar(
    autor,
    "Cargó unidades y personas desde una planilla",
    `${r.unidadesNuevas} unidades nuevas, ${r.unidadesActualizadas} actualizadas, ${r.personasNuevas} personas nuevas, ${r.personasCompletadas} con datos completados, ${r.vinculosNuevos} vínculos nuevos. Suma de alícuotas: ${plan.sumaAlicuotas} %.`,
    condominioId,
  );
  return { ok: true as const, plan, resumen: r };
}
