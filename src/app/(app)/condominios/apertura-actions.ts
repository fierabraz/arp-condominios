"use server";

// COM-001 · Entrega 5: apertura financiera (borrador). Solo para comunidades existentes y solo
// administradores de la propiedad. Nada de esto cambia cobros, pagos, intereses ni fondos: la
// aprobación queda restringida hasta aprobar las reglas D-COM-05 a D-COM-08 y FIN-001.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { puedeVerPropiedad, requireAdministradora } from "@/lib/auth";
import { aFechaDia, aTexto, erroresDe, type EstadoForm } from "@/lib/forms";
import { registrar } from "@/lib/registro";
import { hoyDia } from "@/lib/estructura";
import { EstadoDeudaApertura, TipoCuentaApertura, TipoFondoApertura, TipoObligacionApertura } from "@/generated/prisma/enums";
import {
  claveDeuda,
  claveFila,
  leerDeudas,
  leerMonto,
  leerPeriodo,
  revisarApertura,
  revisarDeuda,
  revisarFechaCorte,
  textoPeriodo,
  type ErrorDeuda,
  type FilaDeuda,
} from "@/lib/apertura";
import { abrirArchivo } from "@/lib/importacion-servicio";
import { datosApertura } from "@/lib/apertura-servicio";
import { formatoMoneda } from "@/lib/formato";

const NO_ENCONTRADA = { mensaje: "Propiedad no encontrada." };

/** Administrador de la propiedad, y la propiedad es una comunidad existente. */
async function acceso(condominioId: string) {
  const { usuario, administradoraId } = await requireAdministradora();
  if (!puedeVerPropiedad(usuario, condominioId)) return null;
  const c = await db.condominio.findFirst({
    where: { id: condominioId, administradoraId },
    select: { id: true, nombre: true, modalidad: true, apertura: { select: { id: true, estado: true, fechaCorte: true } } },
  });
  if (!c || c.modalidad !== "EXISTENTE") return null;
  return { usuario, administradoraId, condominio: c, apertura: c.apertura };
}

/** Acceso a una apertura en borrador (lo único que se puede modificar). */
async function enBorrador(condominioId: string) {
  const a = await acceso(condominioId);
  if (!a) return { error: NO_ENCONTRADA };
  if (!a.apertura) return { error: { mensaje: "Primero indica la fecha de corte." } };
  if (a.apertura.estado !== "BORRADOR") return { error: { mensaje: "La apertura está lista para revisión. Vuelve a borrador para cambiarla." } };
  return { ...a, apertura: a.apertura };
}

const refrescar = (condominioId: string) => revalidatePath(`/condominios/${condominioId}`, "layout");
const pesos = (n: number) => formatoMoneda(n);

const aMontoForm = (v: unknown) => {
  const t = aTexto(v as FormDataEntryValue | null);
  return t === undefined ? undefined : (leerMonto(t) ?? Number.NaN);
};
/** Monto obligatorio en pesos, sin decimales. */
const Monto = (campo: string) =>
  z.preprocess(aMontoForm, z.number({ error: `${campo}: escribe un monto en pesos, sin decimales.` }).int({ error: `${campo}: sin decimales.` }));
/** Monto opcional (vacío = no se sabe, no es cero). */
const MontoOpcional = (campo: string) =>
  z.preprocess(
    (v) => aMontoForm(v) ?? null,
    z.number({ error: `${campo}: escribe un monto en pesos, sin decimales.` }).int().min(0, { error: `${campo} no puede ser negativo.` }).nullable(),
  );
const Fecha = z.preprocess(
  (v) => aFechaDia(v as FormDataEntryValue | null),
  z.date({ error: "Fecha no válida." }).refine((f) => !Number.isNaN(f.getTime()), { error: "Fecha no válida." }).nullable(),
);
const Texto = (max: number) => z.preprocess((v) => aTexto(v as FormDataEntryValue | null) ?? null, z.string().max(max).nullable());

// ── Fecha de corte ─────────────────────────────────────────────────────────

export async function guardarApertura(condominioId: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const a = await acceso(condominioId);
  if (!a) return NO_ENCONTRADA;
  if (a.apertura && a.apertura.estado !== "BORRADOR") return { mensaje: "La apertura está lista para revisión. Vuelve a borrador para cambiarla." };
  const corte = aFechaDia(formData.get("fechaCorte"));
  if (!corte) return { errores: { fechaCorte: ["Ingresa la fecha de corte."] } };
  const error = revisarFechaCorte(corte, hoyDia());
  if (error) return { errores: { fechaCorte: [error] } };
  const observaciones = aTexto(formData.get("observaciones"))?.slice(0, 1000) ?? null;
  if (a.apertura) {
    // Al mover el corte hacia atrás, ninguna deuda puede quedar después de él.
    const mes = corte.toISOString().slice(0, 7);
    const despues = await db.deudaApertura.count({ where: { aperturaId: a.apertura.id, periodo: { gt: mes } } });
    if (despues) return { errores: { fechaCorte: [`Hay ${despues} deudas de meses posteriores a esa fecha. Elimínalas o elige otra fecha.`] } };
    await db.apertura.update({ where: { id: a.apertura.id }, data: { fechaCorte: corte, observaciones } });
  } else {
    await db.apertura.create({
      data: { administradoraId: a.administradoraId, condominioId, fechaCorte: corte, observaciones, preparadoPor: a.usuario.nombre },
    });
  }
  // Cobros que Convive ya emitió dentro del sistema anterior: se avisa (no se cambia nada).
  const cobros = await db.periodo.count({ where: { condominioId, OR: [{ anio: { lt: corte.getUTCFullYear() } }, { anio: corte.getUTCFullYear(), mes: { lte: corte.getUTCMonth() + 1 } }] } });
  await registrar(a.usuario, a.apertura ? "Cambió la fecha de corte de la apertura" : "Inició la apertura financiera", `${a.condominio.nombre}: corte ${corte.toISOString().slice(0, 10)}`, condominioId);
  refrescar(condominioId);
  return {
    ok: true,
    mensaje: cobros
      ? `Guardado. Ojo: Convive ya tiene ${cobros} ${cobros === 1 ? "período" : "períodos"} de cobro hasta esa fecha; revisa que no se cobre dos veces.`
      : "Fecha de corte guardada.",
  };
}

/** Borrador ↔ lista para revisión. Aprobar no existe todavía (restringido). */
export async function cambiarEstadoApertura(condominioId: string, destino: "BORRADOR" | "EN_REVISION"): Promise<EstadoForm> {
  const a = await acceso(condominioId);
  if (!a?.apertura) return NO_ENCONTRADA;
  if (a.apertura.estado === destino) return { ok: true };
  if (destino === "EN_REVISION") {
    const datos = await datosApertura(a.apertura.id);
    const r = revisarApertura(datos.datos, datos.resumen);
    if (!r.ok) return { mensaje: r.bloqueos.join(" ") };
  }
  await db.apertura.update({ where: { id: a.apertura.id }, data: { estado: destino } });
  await registrar(
    a.usuario,
    destino === "EN_REVISION" ? "Marcó la apertura lista para revisión" : "Volvió la apertura a borrador",
    a.condominio.nombre,
    condominioId,
  );
  refrescar(condominioId);
  return { ok: true };
}

// ── Deudas ─────────────────────────────────────────────────────────────────

const DeudaSchema = z.object({
  unidadId: z.string({ error: "Elige la unidad." }).min(1, { error: "Elige la unidad." }),
  periodo: z.preprocess((v) => leerPeriodo(aTexto(v as FormDataEntryValue | null)), z.string({ error: "Elige el mes de origen." })),
  concepto: z.string().trim().min(2, { error: "Indica el concepto." }).max(60),
  montoOriginal: MontoOpcional("Monto original"),
  abonos: MontoOpcional("Abonos"),
  saldo: Monto("Saldo pendiente"),
  vencimiento: Fecha,
  estado: z.enum(EstadoDeudaApertura),
  respaldo: Texto(200),
  observaciones: Texto(300),
});

export async function agregarDeuda(condominioId: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const a = await enBorrador(condominioId);
  if ("error" in a) return a.error!;
  const datos = DeudaSchema.safeParse(Object.fromEntries(formData));
  if (!datos.success) return erroresDe(datos.error);
  const d = datos.data;
  const error = revisarDeuda(d, a.apertura.fechaCorte);
  if (error) return { mensaje: error };
  const unidad = await db.unidad.findFirst({ where: { id: d.unidadId, condominioId }, select: { numero: true } });
  if (!unidad) return { errores: { unidadId: ["Elige una unidad de esta propiedad."] } };
  const existentes = await db.deudaApertura.findMany({ where: { aperturaId: a.apertura.id, unidadId: d.unidadId, periodo: d.periodo }, select: { concepto: true } });
  if (existentes.some((x) => claveDeuda(d.unidadId, d.periodo, x.concepto) === claveDeuda(d.unidadId, d.periodo, d.concepto))) {
    return { mensaje: `La unidad ${unidad.numero} ya tiene una deuda de ${d.concepto.toLowerCase()} de ${textoPeriodo(d.periodo)}.` };
  }
  await db.deudaApertura.create({ data: { ...d, aperturaId: a.apertura.id, origen: "pantalla", creadoPor: a.usuario.nombre } });
  await registrar(a.usuario, "Registró una deuda de apertura", `Unidad ${unidad.numero}, ${d.concepto} ${textoPeriodo(d.periodo)}: ${pesos(d.saldo)}`, condominioId);
  refrescar(condominioId);
  return { ok: true, mensaje: "Deuda registrada." };
}

// ── Saldos a favor y pagos por identificar ─────────────────────────────────

const CreditoSchema = z.object({
  unidadId: z.preprocess((v) => aTexto(v as FormDataEntryValue | null) ?? null, z.string().nullable()),
  monto: Monto("Monto").pipe(z.number().positive({ error: "El monto debe ser mayor que 0." })),
  fecha: Fecha,
  descripcion: Texto(200),
});

export async function agregarCredito(condominioId: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const a = await enBorrador(condominioId);
  if ("error" in a) return a.error!;
  const datos = CreditoSchema.safeParse(Object.fromEntries(formData));
  if (!datos.success) return erroresDe(datos.error);
  const d = datos.data;
  if (d.fecha && d.fecha > a.apertura.fechaCorte) return { errores: { fecha: ["Es posterior al corte: ese pago lo registra Convive."] } };
  const unidad = d.unidadId ? await db.unidad.findFirst({ where: { id: d.unidadId, condominioId }, select: { numero: true } }) : null;
  if (d.unidadId && !unidad) return { errores: { unidadId: ["Elige una unidad de esta propiedad."] } };
  await db.creditoApertura.create({ data: { ...d, aperturaId: a.apertura.id, creadoPor: a.usuario.nombre } });
  await registrar(
    a.usuario,
    unidad ? "Registró un saldo a favor de apertura" : "Registró un pago por identificar de apertura",
    `${unidad ? `Unidad ${unidad.numero}` : "Sin unidad"}: ${pesos(d.monto)}`,
    condominioId,
  );
  refrescar(condominioId);
  return { ok: true, mensaje: "Registrado." };
}

// ── Fondos ─────────────────────────────────────────────────────────────────

const FondoSchema = z.object({
  tipo: z.enum(TipoFondoApertura),
  nombre: z.string().trim().min(2, { error: "Indica el nombre del fondo." }).max(80),
  saldoContable: Monto("Saldo contable"),
  pendienteRecaudar: MontoOpcional("Pendiente de recaudar"),
  observaciones: Texto(300),
});

export async function agregarFondo(condominioId: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const a = await enBorrador(condominioId);
  if ("error" in a) return a.error!;
  const datos = FondoSchema.safeParse(Object.fromEntries(formData));
  if (!datos.success) return erroresDe(datos.error);
  const d = datos.data;
  if (await db.fondoApertura.count({ where: { aperturaId: a.apertura.id, nombre: { equals: d.nombre, mode: "insensitive" } } })) {
    return { errores: { nombre: ["Ya hay un fondo con ese nombre."] } };
  }
  await db.fondoApertura.create({ data: { ...d, aperturaId: a.apertura.id, creadoPor: a.usuario.nombre } });
  await registrar(a.usuario, "Registró un fondo de apertura", `${d.nombre}: saldo contable ${pesos(d.saldoContable)}`, condominioId);
  refrescar(condominioId);
  return { ok: true, mensaje: "Fondo registrado." };
}

// ── Bancos y caja ──────────────────────────────────────────────────────────

const CuentaSchema = z.object({
  tipo: z.enum(TipoCuentaApertura),
  banco: z.string().trim().min(2, { error: "Indica el banco (o «Caja»)." }).max(80),
  numeroFinal: z.preprocess(
    (v) => aTexto(v as FormDataEntryValue | null)?.replace(/\D/g, "").slice(-4) || null,
    z.string().nullable(),
  ),
  titular: Texto(120),
  saldoCartola: Monto("Saldo según cartola"),
  chequesNoCobrados: MontoOpcional("Cheques girados no cobrados"),
  depositosNoAbonados: MontoOpcional("Depósitos no abonados"),
  observaciones: Texto(300),
});

export async function agregarCuenta(condominioId: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const a = await enBorrador(condominioId);
  if ("error" in a) return a.error!;
  const datos = CuentaSchema.safeParse(Object.fromEntries(formData));
  if (!datos.success) return erroresDe(datos.error);
  const d = datos.data;
  // Solo se guardan los últimos 4 dígitos: el número completo no hace falta para cuadrar.
  await db.cuentaApertura.create({
    data: { ...d, chequesNoCobrados: d.chequesNoCobrados ?? 0, depositosNoAbonados: d.depositosNoAbonados ?? 0, aperturaId: a.apertura.id, creadoPor: a.usuario.nombre },
  });
  await registrar(a.usuario, "Registró una cuenta de apertura", `${d.banco}${d.numeroFinal ? ` ···${d.numeroFinal}` : ""}: cartola ${pesos(d.saldoCartola)}`, condominioId);
  refrescar(condominioId);
  return { ok: true, mensaje: "Cuenta registrada." };
}

// ── Obligaciones con terceros ──────────────────────────────────────────────

const ObligacionSchema = z.object({
  tipo: z.enum(TipoObligacionApertura),
  acreedor: z.string().trim().min(2, { error: "Indica a quién se le debe." }).max(120),
  proveedorId: z.preprocess((v) => aTexto(v as FormDataEntryValue | null) ?? null, z.string().nullable()),
  documento: Texto(80),
  fecha: Fecha,
  vencimiento: Fecha,
  monto: Monto("Monto").pipe(z.number().positive({ error: "El monto debe ser mayor que 0." })),
  fondo: Texto(80),
  observaciones: Texto(300),
});

export async function agregarObligacion(condominioId: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const a = await enBorrador(condominioId);
  if ("error" in a) return a.error!;
  const datos = ObligacionSchema.safeParse(Object.fromEntries(formData));
  if (!datos.success) return erroresDe(datos.error);
  const d = datos.data;
  if (d.fecha && d.fecha > a.apertura.fechaCorte) return { errores: { fecha: ["Es posterior al corte: esa factura la registra Convive como gasto."] } };
  if (d.proveedorId && !(await db.proveedor.count({ where: { id: d.proveedorId, administradoraId: a.administradoraId } }))) {
    return { errores: { proveedorId: ["Elige un proveedor del catálogo."] } };
  }
  await db.obligacionApertura.create({ data: { ...d, aperturaId: a.apertura.id, creadoPor: a.usuario.nombre } });
  await registrar(a.usuario, "Registró una obligación de apertura", `${d.acreedor}: ${pesos(d.monto)}`, condominioId);
  refrescar(condominioId);
  return { ok: true, mensaje: "Obligación registrada." };
}

// ── Eliminar (solo en borrador) ────────────────────────────────────────────

const TABLAS = { deuda: "deuda", credito: "saldo a favor", fondo: "fondo", cuenta: "cuenta", obligacion: "obligación" } as const;
export type TablaApertura = keyof typeof TABLAS;

export async function eliminarDeApertura(condominioId: string, tabla: TablaApertura, id: string): Promise<EstadoForm> {
  const a = await enBorrador(condominioId);
  if ("error" in a) return a.error!;
  if (!(tabla in TABLAS)) return NO_ENCONTRADA;
  const where = { id, aperturaId: a.apertura.id };
  const n =
    tabla === "deuda"
      ? await db.deudaApertura.deleteMany({ where })
      : tabla === "credito"
        ? await db.creditoApertura.deleteMany({ where })
        : tabla === "fondo"
          ? await db.fondoApertura.deleteMany({ where })
          : tabla === "cuenta"
            ? await db.cuentaApertura.deleteMany({ where })
            : await db.obligacionApertura.deleteMany({ where });
  if (!n.count) return { mensaje: "Ya no existe." };
  await registrar(a.usuario, `Eliminó un registro de la apertura (${TABLAS[tabla]})`, a.condominio.nombre, condominioId);
  refrescar(condominioId);
  return { ok: true };
}

// ── Deudas desde planilla ──────────────────────────────────────────────────

export type EstadoCargaDeudas =
  | { etapa: "inicio"; errores?: ErrorDeuda[] }
  | {
      etapa: "revision";
      archivo: string;
      nuevas: (FilaDeuda & { numero: string })[];
      repetidas: number;
      errores: ErrorDeuda[];
      total: number;
      filas: string;
    }
  | { etapa: "listo"; cargadas: number; total: number };

/** Compara las filas leídas con las unidades y deudas ya registradas. */
async function planDeudas(condominioId: string, aperturaId: string, filas: FilaDeuda[]) {
  const [unidades, ya] = await Promise.all([
    db.unidad.findMany({ where: { condominioId }, select: { id: true, numero: true } }),
    db.deudaApertura.findMany({ where: { aperturaId }, select: { unidadId: true, periodo: true, concepto: true, saldo: true } }),
  ]);
  const porNumero = new Map(unidades.map((u) => [u.numero.toLowerCase(), u]));
  const registradas = new Map(ya.map((d) => [claveDeuda(d.unidadId, d.periodo, d.concepto), d.saldo]));
  const enArchivo = new Map<string, number>();
  const errores: ErrorDeuda[] = [];
  const nuevas: (FilaDeuda & { numero: string; unidadId: string })[] = [];
  let repetidas = 0;
  for (const f of filas) {
    const u = porNumero.get(f.unidad.toLowerCase());
    if (!u) {
      errores.push({ fila: f.fila, mensaje: `Unidad ${f.unidad}: no existe en esta propiedad. Revisa el número o agrégala primero.` });
      continue;
    }
    const clave = claveFila(f);
    if (enArchivo.has(clave)) {
      errores.push({ fila: f.fila, mensaje: `Unidad ${f.unidad}: ${f.concepto} de ${textoPeriodo(f.periodo)} aparece dos veces (también en la fila ${enArchivo.get(clave)}).` });
      continue;
    }
    enArchivo.set(clave, f.fila);
    const saldo = registradas.get(claveDeuda(u.id, f.periodo, f.concepto));
    if (saldo !== undefined) {
      // Volver a subir la misma planilla no duplica: lo igual se salta, lo distinto es un error.
      if (saldo === f.saldo) repetidas++;
      else errores.push({ fila: f.fila, mensaje: `Unidad ${f.unidad}: ya hay una deuda de ${f.concepto.toLowerCase()} de ${textoPeriodo(f.periodo)} por ${pesos(saldo)}, distinta de la planilla (${pesos(f.saldo)}). Elimínala en pantalla si hay que cambiarla.` });
      continue;
    }
    nuevas.push({ ...f, numero: u.numero, unidadId: u.id });
  }
  return { nuevas, repetidas, errores };
}

export async function revisarDeudasPlanilla(condominioId: string, _: EstadoCargaDeudas, formData: FormData): Promise<EstadoCargaDeudas> {
  const a = await enBorrador(condominioId);
  if ("error" in a) return { etapa: "inicio", errores: [{ fila: 0, mensaje: a.error!.mensaje! }] };
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { etapa: "inicio", errores: [{ fila: 0, mensaje: "Elige el archivo." }] };
  // Mismos controles de seguridad que la carga de unidades; el archivo no se guarda.
  const abierto = await abrirArchivo(archivo);
  if (!abierto.ok) return { etapa: "inicio", errores: [{ fila: 0, mensaje: abierto.mensaje }] };
  let lectura: ReturnType<typeof leerDeudas> | undefined;
  for (const h of abierto.hojas) {
    const l = leerDeudas(h.datos, a.apertura.fechaCorte, h.nombre);
    if (l.filas.length || l.errores.some((e) => e.fila > 0)) {
      lectura = l;
      break;
    }
    lectura ??= l;
  }
  if (!lectura || (!lectura.filas.length && !lectura.errores.length)) return { etapa: "inicio", errores: [{ fila: 0, mensaje: "La planilla no tiene deudas." }] };
  const hoja = lectura.errores[0]?.hoja ?? abierto.hojas[0].nombre;
  const plan = await planDeudas(condominioId, a.apertura.id, lectura.filas);
  const nuevas = plan.nuevas;
  return {
    etapa: "revision",
    archivo: archivo.name,
    nuevas,
    repetidas: plan.repetidas,
    errores: [...lectura.errores, ...plan.errores.map((e) => ({ ...e, hoja }))].sort((x, y) => x.fila - y.fila),
    total: nuevas.reduce((s, f) => s + f.saldo, 0),
    filas: JSON.stringify(lectura.filas),
  };
}

const FilasDeudaSchema = z
  .array(
    z.object({
      fila: z.number().int(),
      unidad: z.string().min(1).max(50),
      periodo: z.string().regex(/^\d{4}-\d{2}$/),
      concepto: z.string().min(1).max(60),
      montoOriginal: z.number().int().nullable().optional(),
      abonos: z.number().int().nullable().optional(),
      saldo: z.number().int(),
      vencimiento: z.coerce.date().nullable().optional(),
      estado: z.enum(EstadoDeudaApertura),
      observaciones: z.string().max(300).optional(),
    }),
  )
  .min(1)
  .max(3000);

/** Carga lo revisado en una sola transacción. Se vuelve a revisar todo contra la base de este momento. */
export async function confirmarDeudasPlanilla(condominioId: string, _: EstadoCargaDeudas, formData: FormData): Promise<EstadoCargaDeudas> {
  const a = await enBorrador(condominioId);
  if ("error" in a) return { etapa: "inicio", errores: [{ fila: 0, mensaje: a.error!.mensaje! }] };
  let filas: FilaDeuda[];
  try {
    const d = FilasDeudaSchema.safeParse(JSON.parse(String(formData.get("filas") ?? "")));
    if (!d.success) throw new Error();
    filas = d.data;
  } catch {
    return { etapa: "inicio", errores: [{ fila: 0, mensaje: "No pude leer la planilla revisada. Súbela otra vez." }] };
  }
  const archivo = String(formData.get("archivo") ?? "planilla").slice(0, 120);
  // Las reglas se vuelven a aplicar: no se confía en lo que viene del navegador.
  if (filas.some((f) => revisarDeuda(f, a.apertura.fechaCorte))) return { etapa: "inicio", errores: [{ fila: 0, mensaje: "La planilla cambió. Súbela otra vez." }] };
  try {
    const r = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Apertura" WHERE id = ${a.apertura.id} FOR UPDATE`;
      const plan = await planDeudas(condominioId, a.apertura.id, filas);
      if (plan.errores.length) return null;
      await tx.deudaApertura.createMany({
        data: plan.nuevas.map((f) => ({
          aperturaId: a.apertura.id,
          unidadId: f.unidadId,
          periodo: f.periodo,
          concepto: f.concepto,
          montoOriginal: f.montoOriginal ?? null,
          abonos: f.abonos ?? null,
          saldo: f.saldo,
          vencimiento: f.vencimiento ?? null,
          estado: f.estado,
          observaciones: f.observaciones ?? null,
          origen: `${archivo}, fila ${f.fila}`,
          creadoPor: a.usuario.nombre,
        })),
      });
      return plan.nuevas;
    });
    if (!r) return { etapa: "inicio", errores: [{ fila: 0, mensaje: "Algo cambió desde la revisión. Sube la planilla otra vez." }] };
    const total = r.reduce((s, f) => s + f.saldo, 0);
    await registrar(a.usuario, "Cargó deudas de apertura desde una planilla", `${archivo}: ${r.length} deudas por ${pesos(total)}`, condominioId);
    refrescar(condominioId);
    return { etapa: "listo", cargadas: r.length, total };
  } catch (e) {
    console.error("Error al cargar deudas de apertura:", e);
    return { etapa: "inicio", errores: [{ fila: 0, mensaje: "No se pudo completar la carga y no se guardó nada. Inténtalo de nuevo." }] };
  }
}
