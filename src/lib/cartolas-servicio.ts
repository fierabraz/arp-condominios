import "server-only";
// FIN-003.1 · Importador de cartolas: abrir el archivo, compararlo con la cuenta y guardarlo.
// La apertura del archivo (tamaño, tipo real, zip, hojas) es la misma de la carga de COM-001.

import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import type { UsuarioActual } from "@/lib/auth";
import { abrirArchivo, MAXIMO_FILAS, tamanoDescomprimido, type HojaLeida } from "@/lib/importacion-servicio";
import { normalizarTitulo, perfilQueCalza } from "@/lib/importacion";
import {
  faltantes,
  FORMATOS_INICIALES,
  leerHojaCartola,
  revisarMapeoCartola,
  type ColumnaCartola,
  type EstadoCartola,
  type Formatos,
  type HojaInfo,
  type InfoArchivo,
  type LecturaCartola,
  type MapeoCartola,
  type OpcionesEnvio,
} from "@/lib/cartolas";
import { clasificar, conHuellas, type MovimientoGuardado } from "@/lib/cartolas-duplicados";
import { registrar, registrarEn } from "@/lib/registro";
import { hoyChile } from "@/lib/formato";

/** Más movimientos que esto en una sola cartola: hay que dividirla (por mes, por ejemplo). */
export const MAXIMO_MOVIMIENTOS = 5000;

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];
export type CuentaDeCartola = { id: string; banco: string; numeroFinal: string; condominioId: string; administradoraId: string };
type Autor = Pick<UsuarioActual, "id" | "nombre" | "administradoraId">;

/** Nombres de los archivos dentro de un .xlsx (es un zip), leídos del índice sin descomprimir. */
export function nombresZip(zip: Buffer): string[] {
  const desde = Math.max(0, zip.length - 65_557);
  for (let i = zip.length - 22; i >= desde; i--) {
    if (zip.readUInt32LE(i) !== 0x06054b50) continue;
    const entradas = zip.readUInt16LE(i + 10);
    let pos = zip.readUInt32LE(i + 16);
    const nombres: string[] = [];
    for (let n = 0; n < entradas && pos + 46 <= zip.length; n++) {
      const largo = zip.readUInt16LE(pos + 28);
      nombres.push(zip.toString("utf8", pos + 46, pos + 46 + largo));
      pos += 46 + largo + zip.readUInt16LE(pos + 30) + zip.readUInt16LE(pos + 32);
    }
    return nombres;
  }
  return [];
}

type Abierto = { ok: true; hojas: HojaLeida[]; info: InfoArchivo } | { ok: false; mensaje: string };

/**
 * Abre la cartola con los mismos controles de la carga de planillas (tamaño, tipo real, «bomba zip»,
 * cantidad de hojas) y además rechaza libros con macros. Solo se leen valores: las fórmulas, macros y
 * conexiones externas no se ejecutan. El archivo no se guarda: solo su huella SHA-256.
 */
export async function abrirCartola(archivo: File): Promise<Abierto> {
  const nombre = archivo.name.toLowerCase();
  if (nombre.endsWith(".pdf")) return { ok: false, mensaje: "Todavía no se pueden leer cartolas en PDF. Descarga la cartola en Excel (.xlsx) o CSV desde el banco." };
  if (nombre.endsWith(".xlsm") || nombre.endsWith(".xlsb")) return { ok: false, mensaje: "Ese libro de Excel puede traer macros. Descarga la cartola como .xlsx o .csv." };
  const contenido = Buffer.from(await archivo.arrayBuffer());
  if (nombre.endsWith(".xlsx") && contenido.length >= 4 && contenido.readUInt32LE(0) === 0x04034b50 && tamanoDescomprimido(contenido) !== null) {
    const dentro = nombresZip(contenido).map((n) => n.toLowerCase());
    if (dentro.some((n) => n.includes("vbaproject") || n.endsWith(".bin") && n.includes("activex"))) {
      return { ok: false, mensaje: "La planilla trae macros y no se abre por seguridad. Descarga la cartola de nuevo desde el banco como .xlsx o .csv." };
    }
  }
  const abierto = await abrirArchivo(archivo);
  if (!abierto.ok) return abierto;
  const grande = abierto.hojas.find((h) => h.datos.length >= MAXIMO_FILAS + 20);
  if (grande) return { ok: false, mensaje: `La hoja «${grande.nombre}» tiene más de ${MAXIMO_FILAS.toLocaleString("es-CL")} filas. Descarga la cartola por períodos más cortos (por ejemplo, un mes).` };
  return {
    ok: true,
    hojas: abierto.hojas,
    info: {
      nombre: archivo.name.slice(0, 200),
      tamano: archivo.size,
      formato: nombre.endsWith(".xlsx") ? "XLSX" : "CSV",
      huella: createHash("sha256").update(contenido).digest("hex"),
    },
  };
}

type Perfil = { id: string; nombre: string; banco: string; columnas: MapeoCartola; formatos: Formatos };

export async function perfilesDe(administradoraId: string): Promise<Perfil[]> {
  const perfiles = await db.perfilCartola.findMany({ where: { administradoraId }, orderBy: { actualizadoEn: "desc" } });
  return perfiles.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    banco: p.banco,
    columnas: p.columnas as MapeoCartola,
    formatos: { fecha: p.formatoFecha, decimal: p.separadorDecimal, signo: p.signoMonto } as Formatos,
  }));
}

type Interpretacion =
  | { tipo: "error"; mensaje: string }
  | { tipo: "columnas"; hojas: HojaInfo[]; columnas: ColumnaCartola[]; formatos: Formatos; faltan: string[]; perfil?: Perfil }
  | { tipo: "lectura"; hojas: HojaInfo[]; columnas: ColumnaCartola[]; formatos: Formatos; perfil?: Perfil; lecturas: LecturaCartola[]; mapeo: MapeoCartola };

/**
 * Elige las hojas y cómo leerlas: lo que diga el administrador (asistente), o el perfil guardado que
 * calce con los títulos, o el reconocimiento automático. Ninguna hoja con datos se ignora en silencio:
 * todas aparecen en la lista con lo que se encontró en ellas.
 */
export function interpretar(hojas: HojaLeida[], perfiles: Perfil[], opciones: OpcionesEnvio, hoy: string): Interpretacion {
  const conDatos = hojas.filter((h) => h.datos.some((f) => f.some((c) => c !== null && String(c).trim() !== "")));
  if (!conDatos.length) return { tipo: "error", mensaje: "El archivo está vacío." };
  const manual = opciones.mapeo && Object.keys(opciones.mapeo).length ? opciones.mapeo : undefined;
  const leidas = conDatos.map((h) => {
    const perfil = manual ? undefined : perfilQueCalza(h.datos, perfiles, "fecha") ?? undefined;
    const formatos = manual ? (opciones.formatos ?? FORMATOS_INICIALES) : (perfil?.formatos ?? opciones.formatos ?? FORMATOS_INICIALES);
    const lectura = leerHojaCartola(h.nombre, h.datos, { mapeo: manual ?? perfil?.columnas, formatos, hoy });
    return { hoja: h, perfil, formatos, lectura };
  });
  const validas = new Set(conDatos.map((h) => h.nombre));
  const pedidas = (opciones.hojas ?? []).filter((n) => validas.has(n));
  let elegidas = pedidas.length
    ? leidas.filter((l) => pedidas.includes(l.hoja.nombre))
    : leidas.filter((l) => !l.lectura.sinTitulos && l.lectura.movimientos.length + l.lectura.errores.length > 0);
  if (!elegidas.length) {
    elegidas = [[...leidas].sort((a, b) => b.lectura.columnas.length - a.lectura.columnas.length)[0]];
  }
  const nombres = new Set(elegidas.map((l) => l.hoja.nombre));
  const infoHojas: HojaInfo[] = leidas.map((l) => ({
    nombre: l.hoja.nombre,
    filas: l.hoja.datos.filter((f) => f.some((c) => c !== null && String(c).trim() !== "")).length,
    reconocida: !l.lectura.sinTitulos,
    movimientos: l.lectura.movimientos.length,
    elegida: nombres.has(l.hoja.nombre),
    perfil: l.perfil?.nombre,
  }));
  // Columnas para el asistente: las de las hojas elegidas, sin repetir títulos.
  const columnas: ColumnaCartola[] = [];
  const vistos = new Set<string>();
  for (const l of elegidas) {
    for (const c of l.lectura.columnas) {
      const t = normalizarTitulo(c.titulo);
      if (vistos.has(t)) continue;
      vistos.add(t);
      columnas.push(c);
    }
  }
  const perfil = elegidas.find((l) => l.perfil)?.perfil;
  const formatos = elegidas[0].formatos;
  const incompleta = elegidas.find((l) => l.lectura.sinTitulos || faltantes(l.lectura.columnas).length);
  if (incompleta) {
    return { tipo: "columnas", hojas: infoHojas, columnas, formatos, faltan: faltantes(incompleta.lectura.columnas), perfil };
  }
  const mapeo: MapeoCartola = {};
  for (const c of columnas) mapeo[normalizarTitulo(c.titulo)] = c.clave ?? "ignorar";
  return { tipo: "lectura", hojas: infoHojas, columnas, formatos, perfil, lecturas: elegidas.map((l) => l.lectura), mapeo };
}

const fechaISO = (d: Date) => d.toISOString().slice(0, 10);

/** Movimientos de la cuenta en el período de la cartola, para reconocer lo ya registrado. */
async function guardadosEn(tx: Pick<Tx, "movimientoBancario">, cuentaId: string, desde: string, hasta: string): Promise<MovimientoGuardado[]> {
  const movs = await tx.movimientoBancario.findMany({
    where: { cuentaId, fecha: { gte: new Date(`${desde}T00:00:00Z`), lte: new Date(`${hasta}T00:00:00Z`) } },
    select: { id: true, huella: true, fecha: true, monto: true, referencia: true, descripcion: true, saldo: true, importacion: { select: { creadoEn: true } } },
    orderBy: [{ fecha: "asc" }, { creadoEn: "asc" }],
  });
  return movs.map((m) => ({
    id: m.id,
    huella: m.huella,
    fecha: fechaISO(m.fecha),
    monto: Number(m.monto),
    referencia: m.referencia,
    descripcion: m.descripcion,
    saldo: m.saldo === null ? null : Number(m.saldo),
    importado: m.importacion.creadoEn.toISOString(),
  }));
}

const filasTexto = (filas: number[]) => (filas.length > 8 ? `${filas.slice(0, 8).join(", ")} y ${filas.length - 8} más` : filas.join(", "));

/** Compara la lectura con lo que ya tiene la cuenta y arma la vista previa. No guarda nada. */
async function vistaPrevia(
  tx: Pick<Tx, "movimientoBancario" | "importacionCartola">,
  cuenta: CuentaDeCartola,
  info: InfoArchivo,
  i: Extract<Interpretacion, { tipo: "lectura" }>,
): Promise<Extract<EstadoCartola, { etapa: "revision" }> | { etapa: "inicio"; mensaje: string }> {
  const movimientos = i.lecturas.flatMap((l) => l.movimientos);
  const errores = i.lecturas.flatMap((l) => l.errores);
  if (movimientos.length > MAXIMO_MOVIMIENTOS) {
    return { etapa: "inicio", mensaje: `La cartola trae más de ${MAXIMO_MOVIMIENTOS.toLocaleString("es-CL")} movimientos. Descárgala por períodos más cortos.` };
  }
  if (!movimientos.length && !errores.length) {
    return { etapa: "inicio", mensaje: "No encontré movimientos en las hojas elegidas." };
  }
  const avisos = i.lecturas.flatMap((l, k) => {
    const nombre = i.hojas.filter((h) => h.elegida)[k]?.nombre ?? "";
    const extra: string[] = [];
    if (l.omitidas.length) {
      const una = l.omitidas.length === 1;
      extra.push(`Hoja «${nombre}»: se ${una ? "dejó fuera 1 fila que no es movimiento" : `dejaron fuera ${l.omitidas.length} filas que no son movimientos`} (títulos repetidos, totales o saldos): ${una ? "fila " : "filas "}${filasTexto(l.omitidas)}.`);
    }
    if (l.saldo) {
      extra.push(
        l.saldo.descuadres.length
          ? `Hoja «${nombre}»: en ${l.saldo.descuadres.length} ${l.saldo.descuadres.length === 1 ? "fila" : "filas"} el saldo del banco no cuadra con el cargo o abono (${filasTexto(l.saldo.descuadres)}). Revisa que las columnas estén bien asignadas.`
          : `Hoja «${nombre}»: los saldos del banco cuadran con los cargos y abonos en todas las filas: los montos se leyeron bien.`,
      );
    }
    // En un CSV no hay hojas: se habla de «la cartola».
    return [...l.avisos, ...extra].map((a) => (info.formato === "CSV" ? a.replace(`Hoja «${nombre}»: `, "").replace(/^./, (c) => c.toUpperCase()) : a));
  });
  const fechas = movimientos.map((m) => m.fecha).sort();
  const periodo = fechas.length ? { desde: fechas[0], hasta: fechas[fechas.length - 1] } : null;
  const guardados = periodo ? await guardadosEn(tx, cuenta.id, periodo.desde, periodo.hasta) : [];
  const filas = clasificar(conHuellas(movimientos), guardados);
  const anterior = await tx.importacionCartola.findFirst({
    where: { cuentaId: cuenta.id, archivoHuella: info.huella },
    orderBy: { creadoEn: "desc" },
    select: { creadoEn: true, usuarioNombre: true },
  });
  const cuenta_ = (e: string) => filas.filter((f) => f.estado === e).length;
  return {
    etapa: "revision",
    archivo: info,
    hojas: i.hojas,
    columnas: i.columnas,
    formatos: i.formatos,
    perfil: i.perfil && { id: i.perfil.id, nombre: i.perfil.nombre, banco: i.perfil.banco },
    resumen: {
      encontrados: movimientos.length + errores.length,
      nuevos: cuenta_("NUEVO"),
      registrados: cuenta_("REGISTRADO"),
      porRevisar: cuenta_("POSIBLE_DUPLICADO"),
      errores: errores.length,
    },
    filas,
    errores,
    avisos,
    periodo,
    yaImportado: anterior ? { fecha: anterior.creadoEn.toISOString(), usuario: anterior.usuarioNombre } : undefined,
  };
}

/** Guarda (o actualiza) el formato confirmado en el asistente como perfil de la administradora. */
async function guardarPerfil(autor: Autor, administradoraId: string, condominioId: string, i: Extract<Interpretacion, { tipo: "lectura" }>, pedido: { nombre: string; banco: string }, formatos: Formatos) {
  const hoja = i.hojas.find((h) => h.elegida)?.nombre;
  const datos = {
    banco: pedido.banco,
    columnas: i.mapeo,
    hoja: hoja ?? null,
    formatoFecha: formatos.fecha,
    separadorDecimal: formatos.decimal,
    signoMonto: formatos.signo,
    creadoPor: autor.nombre,
  };
  await db.perfilCartola.upsert({
    where: { administradoraId_nombre: { administradoraId, nombre: pedido.nombre } },
    create: { administradoraId, nombre: pedido.nombre, ...datos },
    update: datos,
  });
  await registrar(autor, "Guardó un perfil de cartola bancaria", `${pedido.banco} — ${pedido.nombre}`, condominioId);
}

/** Paso 1: leer la cartola y mostrar la vista previa (o el asistente de columnas). No guarda movimientos. */
export async function revisarCartola(autor: Autor, cuenta: CuentaDeCartola, archivo: File, opciones: OpcionesEnvio): Promise<EstadoCartola> {
  const abierto = await abrirCartola(archivo);
  if (!abierto.ok) return { etapa: "inicio", mensaje: abierto.mensaje };
  const perfiles = await perfilesDe(cuenta.administradoraId);
  const i = interpretar(abierto.hojas, perfiles, opciones, hoyChile());
  if (i.tipo === "error") return { etapa: "inicio", mensaje: i.mensaje };
  if (i.tipo === "columnas") {
    return {
      etapa: "columnas",
      archivo: abierto.info,
      hojas: i.hojas,
      columnas: i.columnas,
      formatos: i.formatos,
      faltan: i.faltan,
      perfil: i.perfil && { id: i.perfil.id, nombre: i.perfil.nombre, banco: i.perfil.banco },
      mensaje: opciones.mapeo ? `Falta indicar ${i.faltan.join(" y ")}.` : undefined,
    };
  }
  if (opciones.mapeo) {
    const error = revisarMapeoCartola(opciones.mapeo);
    if (error) {
      return { etapa: "columnas", archivo: abierto.info, hojas: i.hojas, columnas: i.columnas, formatos: i.formatos, faltan: [], mensaje: error };
    }
  }
  const previa = await vistaPrevia(db, cuenta, abierto.info, i);
  if (previa.etapa === "revision" && opciones.guardarPerfil && opciones.mapeo) {
    await guardarPerfil(autor, cuenta.administradoraId, cuenta.condominioId, i, opciones.guardarPerfil, opciones.formatos ?? i.formatos);
    previa.perfilGuardado = opciones.guardarPerfil.nombre;
  }
  return previa;
}

export class CambioDuranteRevision extends Error {}

/**
 * Paso 2: guardar los movimientos nuevos. Se vuelve a leer el archivo y a comparar con la cuenta
 * bloqueada (FOR UPDATE), así dos importaciones a la vez no se pisan y nada de lo que mande la
 * pantalla se toma por cierto. O se guarda el lote completo o nada.
 */
export async function confirmarCartola(autor: Autor, cuenta: CuentaDeCartola, archivo: File, opciones: OpcionesEnvio): Promise<EstadoCartola> {
  const abierto = await abrirCartola(archivo);
  if (!abierto.ok) return { etapa: "inicio", mensaje: abierto.mensaje };
  const perfiles = await perfilesDe(cuenta.administradoraId);
  const i = interpretar(abierto.hojas, perfiles, { ...opciones, guardarPerfil: undefined }, hoyChile());
  if (i.tipo !== "lectura") return { etapa: "inicio", mensaje: "La cartola ya no se puede leer igual que en la revisión. Súbela otra vez." };

  try {
    return await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "CuentaBancaria" WHERE id = ${cuenta.id} FOR UPDATE`;
        const previa = await vistaPrevia(tx, cuenta, abierto.info, i);
        if (previa.etapa !== "revision") return previa;
        const r = previa.resumen;
        const e = opciones.esperado;
        if (!e || e.nuevos !== r.nuevos || e.registrados !== r.registrados || e.porRevisar !== r.porRevisar) {
          return { ...previa, mensaje: "Mientras revisabas, la cuenta cambió (otra importación o cartola distinta). Revisa la vista previa actualizada y confirma de nuevo." };
        }
        if (previa.errores.length && !opciones.omitirErrores) {
          return { ...previa, mensaje: "Hay filas con error. Corrígelas en la cartola o marca que quieres importar solo los movimientos válidos." };
        }
        const decisiones = opciones.decisiones ?? {};
        const posibles = previa.filas.filter((f) => f.estado === "POSIBLE_DUPLICADO");
        if (posibles.some((f) => !decisiones[f.huella])) {
          return { ...previa, mensaje: "Decide qué hacer con cada posible duplicado antes de confirmar." };
        }
        const aImportar = previa.filas.filter((f) => f.estado === "NUEVO" || (f.estado === "POSIBLE_DUPLICADO" && decisiones[f.huella] === "importar"));
        if (!aImportar.length) return { ...previa, mensaje: "No hay movimientos nuevos para importar: no se guardó nada." };

        const omitidos = posibles.length - posibles.filter((f) => decisiones[f.huella] === "importar").length;
        const importacion = await tx.importacionCartola.create({
          data: {
            administradoraId: cuenta.administradoraId,
            condominioId: cuenta.condominioId,
            cuentaId: cuenta.id,
            banco: cuenta.banco,
            archivoNombre: abierto.info.nombre,
            archivoHuella: abierto.info.huella,
            archivoTamano: abierto.info.tamano,
            formato: abierto.info.formato,
            hojas: i.hojas.filter((h) => h.elegida).map((h) => h.nombre.slice(0, 120)),
            perfilNombre: i.perfil?.nombre ?? null,
            desde: previa.periodo ? new Date(`${previa.periodo.desde}T00:00:00Z`) : null,
            hasta: previa.periodo ? new Date(`${previa.periodo.hasta}T00:00:00Z`) : null,
            encontrados: r.encontrados,
            nuevos: aImportar.length,
            yaRegistrados: r.registrados,
            posiblesDuplicados: posibles.length,
            duplicadosOmitidos: omitidos,
            errores: previa.errores.length,
            detalleErrores: previa.errores.length ? previa.errores.slice(0, 300) : undefined,
            estado: "APLICADA",
            usuarioId: autor.id,
            usuarioNombre: autor.nombre,
          },
        });
        await tx.movimientoBancario.createMany({
          data: aImportar.map((f) => ({
            administradoraId: cuenta.administradoraId,
            condominioId: cuenta.condominioId,
            cuentaId: cuenta.id,
            importacionId: importacion.id,
            fecha: new Date(`${f.fecha}T00:00:00Z`),
            descripcion: f.descripcion ?? null,
            referencia: f.referencia ?? null,
            monto: f.monto,
            saldo: f.saldo ?? null,
            contraparte: f.contraparte ?? null,
            rutContraparte: f.rutContraparte ?? null,
            otros: f.otros,
            hoja: f.hoja.slice(0, 120),
            fila: f.fila,
            huella: f.huella,
            estado: f.estado === "POSIBLE_DUPLICADO" ? "REVISAR" : "PENDIENTE",
            nota:
              f.estado === "POSIBLE_DUPLICADO"
                ? `Parecido a un movimiento importado el ${f.parecido?.importado.slice(0, 10).split("-").reverse().join("-")}; ${autor.nombre} indicó que es otra operación.`
                : null,
          })),
        });
        const periodo = previa.periodo ? ` del ${previa.periodo.desde.split("-").reverse().join("-")} al ${previa.periodo.hasta.split("-").reverse().join("-")}` : "";
        await registrarEn(tx, {
          autor,
          accion: "Importó una cartola bancaria",
          detalle: `${cuenta.banco} ···${cuenta.numeroFinal}: «${abierto.info.nombre}»${periodo}. ${aImportar.length} movimientos nuevos, ${r.registrados} ya registrados, ${posibles.length} posibles duplicados (${omitidos} omitidos), ${previa.errores.length} filas con error. Huella del archivo ${abierto.info.huella.slice(0, 16)}…`,
          condominioId: cuenta.condominioId,
          entidad: "ImportacionCartola",
          entidadId: importacion.id,
          despues: { nuevos: aImportar.length, yaRegistrados: r.registrados, posiblesDuplicados: posibles.length, omitidos, errores: previa.errores.length, huella: abierto.info.huella },
        });
        return { etapa: "listo", importacionId: importacion.id, nuevos: aImportar.length, omitidos: r.registrados + omitidos, errores: previa.errores.length, periodo: previa.periodo };
      },
      { timeout: 60_000, maxWait: 15_000 },
    );
  } catch (e) {
    if (typeof e === "object" && e && "code" in e && (e as { code: string }).code === "P2002") {
      return { etapa: "inicio", mensaje: "Otra persona importó movimientos de esta cuenta al mismo tiempo. Sube la cartola otra vez para ver qué falta." };
    }
    throw e;
  }
}
