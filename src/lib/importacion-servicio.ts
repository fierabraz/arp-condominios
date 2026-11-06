import "server-only";
import { randomUUID } from "node:crypto";
import readXlsxFile from "read-excel-file/node";
import { db } from "@/lib/db";
import type { UsuarioActual } from "@/lib/auth";
import {
  leerCsv,
  leerPlanilla,
  planificar,
  resumenPlan,
  type FilaImportada,
  type Lectura,
  type Relacion,
  type Tipo,
} from "@/lib/importacion";
import { registrar } from "@/lib/registro";

export const MAXIMO_FILAS = 3000;
/** Bajo el límite de 1 MB que tienen las acciones del servidor. */
export const TAMANO_MAXIMO = 900 * 1024;

/** Lee un archivo .xlsx o .csv subido y devuelve sus filas interpretadas. */
export async function leerArchivo(archivo: File): Promise<Lectura> {
  const nombre = archivo.name.toLowerCase();
  const error = (mensaje: string): Lectura => ({ filas: [], errores: [{ fila: 0, mensaje }], avisos: [] });
  if (archivo.size === 0) return error("Elige un archivo.");
  if (archivo.size > TAMANO_MAXIMO) return error("El archivo pesa más de 900 KB. Divide la planilla en partes más chicas.");
  const contenido = Buffer.from(await archivo.arrayBuffer());

  let hojas: unknown[][][];
  if (nombre.endsWith(".csv") || nombre.endsWith(".txt")) {
    // Excel en Windows guarda los CSV en Windows-1252: si no es UTF-8 válido, se lee así.
    let texto = new TextDecoder("utf-8").decode(contenido);
    if (texto.includes("�")) texto = new TextDecoder("windows-1252").decode(contenido);
    hojas = [leerCsv(texto)];
  } else if (nombre.endsWith(".xlsx")) {
    try {
      hojas = (await readXlsxFile(contenido)).map((h) => h.data as unknown[][]);
    } catch {
      return error("No pude abrir el archivo. Revisa que sea una planilla de Excel (.xlsx).");
    }
  } else if (nombre.endsWith(".xls")) {
    return error('Ese es el formato antiguo de Excel (.xls). En Excel usa "Guardar como" y elige "Libro de Excel (.xlsx)".');
  } else {
    return error("Sube una planilla de Excel (.xlsx) o un archivo .csv.");
  }

  // Se usa la primera hoja que tenga la columna "Unidad" (la plantilla trae también una hoja de ayuda).
  const lecturas = hojas.map(leerPlanilla);
  const lectura = lecturas.find((l) => !l.sinTitulos) ?? lecturas[0];
  if (!lectura) return error("La planilla está vacía.");
  if (lectura.filas.length > MAXIMO_FILAS) return error(`La planilla tiene más de ${MAXIMO_FILAS} filas. Divídela en partes.`);
  return lectura;
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
    db.unidadPersona.findMany({
      where: { unidad: { condominioId, administradoraId } },
      select: { unidadId: true, personaId: true, relacion: true },
    }),
  ]);
  return { unidades: unidades.map((u) => ({ ...u, alicuota: Number(u.alicuota) })), personas, vinculos };
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
    .map((v) => ({ unidadId: idUnidad.get(v.numero)!, personaId: idPersona.get(v.persona)!, relacion: v.relacion as Relacion }));

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
        await tx.unidadPersona.createMany({ data: vinculos, skipDuplicates: true });
        // COM-001 · Entrega 3: también al historial, sin fecha de inicio (la planilla no la trae).
        await tx.vinculoUnidad.createMany({
          data: vinculos.map((v) => ({
            administradoraId,
            unidadId: v.unidadId,
            personaId: v.personaId,
            tipo: v.relacion,
            creadoPor: `${autor.nombre} (carga desde planilla)`,
          })),
        });
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
