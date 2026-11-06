// COM-001 · Entrega 5: apertura financiera de una comunidad existente. Funciones puras para probarlas.
// La apertura es un borrador con la fecha de corte y los saldos del sistema anterior. Todavía no
// se aprueba ni cambia cobros, pagos, intereses ni fondos: eso queda restringido hasta aprobar
// las reglas D-COM-05 a D-COM-08 y el libro de fondos (FIN-001).

import { leerFecha, normalizarTitulo } from "./importacion";

export type EstadoApertura = "BORRADOR" | "EN_REVISION";
export type EstadoDeuda = "CONFIRMADA" | "DISCUTIDA" | "EN_CONVENIO" | "POR_VERIFICAR";
export type TipoFondo = "ORDINARIO" | "RESERVA" | "PROYECTO" | "OTRO";
export type TipoCuenta = "CORRIENTE" | "VISTA" | "AHORRO" | "CAJA";
export type TipoObligacion = "PROVEEDOR" | "REMUNERACION" | "IMPUESTO" | "OTRO";

export const ESTADOS_APERTURA: Record<EstadoApertura, { texto: string; ayuda: string }> = {
  BORRADOR: { texto: "Borrador", ayuda: "Se están registrando los saldos. Se puede cambiar todo." },
  EN_REVISION: { texto: "Lista para revisión", ayuda: "Quedó cerrada para revisarla. Para corregir algo, vuelve a borrador." },
};

export const ESTADOS_DEUDA: Record<EstadoDeuda, { texto: string; ayuda: string; tono: "exito" | "alerta" | "marca" | "neutro" }> = {
  CONFIRMADA: { texto: "Confirmada", ayuda: "Respaldada y reconocida.", tono: "exito" },
  DISCUTIDA: { texto: "Discutida", ayuda: "El propietario no la reconoce. No cuenta como morosidad.", tono: "alerta" },
  EN_CONVENIO: { texto: "En convenio", ayuda: "Incluida en un convenio de pago vigente.", tono: "marca" },
  POR_VERIFICAR: { texto: "Por verificar", ayuda: "Falta revisar el respaldo. No cuenta como morosidad.", tono: "neutro" },
};
export const ORDEN_ESTADOS_DEUDA: EstadoDeuda[] = ["CONFIRMADA", "EN_CONVENIO", "DISCUTIDA", "POR_VERIFICAR"];

export const CONCEPTOS = ["Gasto común", "Fondo de reserva", "Interés", "Multa", "Consumo", "Cuota extraordinaria", "Otro"];

export const TIPOS_FONDO: Record<TipoFondo, string> = {
  ORDINARIO: "Fondo de operación",
  RESERVA: "Fondo común de reserva",
  PROYECTO: "Fondo de proyecto",
  OTRO: "Otro fondo",
};
export const TIPOS_CUENTA: Record<TipoCuenta, string> = {
  CORRIENTE: "Cuenta corriente",
  VISTA: "Cuenta vista",
  AHORRO: "Cuenta de ahorro",
  CAJA: "Caja chica",
};
export const TIPOS_OBLIGACION: Record<TipoObligacion, string> = {
  PROVEEDOR: "Proveedor",
  REMUNERACION: "Remuneraciones",
  IMPUESTO: "Impuestos y cotizaciones",
  OTRO: "Otro acreedor",
};

/**
 * Diferencia bancaria desde la que, según la recomendación de D-COM-07 (por decidir), se
 * bloquearía la habilitación financiera. Mientras no se decida, solo se muestra como observación.
 */
export const UMBRAL_DIFERENCIA = 1000;

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** "2026-09" → "septiembre 2026". */
export const textoPeriodo = (p: string) => {
  const [a, m] = p.split("-").map(Number);
  return `${MESES[m - 1]} ${a}`;
};

/** "2026-09", "09-2026", "9/2026", "sep 2026", "Septiembre 2026" o una fecha → "2026-09"; null si no se entiende. */
export function leerPeriodo(valor: unknown): string | null {
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor.toISOString().slice(0, 7);
  const s = String(valor ?? "").trim().toLowerCase();
  let a: number | undefined, m: number | undefined;
  let r = s.match(/^(\d{4})[-/.](\d{1,2})$/);
  if (r) [a, m] = [Number(r[1]), Number(r[2])];
  else if ((r = s.match(/^(\d{1,2})[-/.](\d{4})$/))) [m, a] = [Number(r[1]), Number(r[2])];
  else if ((r = s.match(/^([a-zñé]+)[\s\-/.]*(?:de\s+)?(\d{4})$/))) {
    const nombre = normalizarTitulo(r[1]);
    const i = nombre.length >= 3 ? MESES.findIndex((x) => normalizarTitulo(x).startsWith(nombre)) : -1;
    if (i === -1) return null;
    [m, a] = [i + 1, Number(r[2])];
  } else {
    // Una fecha completa: se toma su mes.
    const f = leerFecha(s);
    return f ? f.slice(0, 7) : null;
  }
  if (!a || !m || m < 1 || m > 12 || a < 1990 || a > 2100) return null;
  return `${a}-${String(m).padStart(2, "0")}`;
}

/**
 * Monto en pesos, sin decimales: "$65.000", "65000", "65.000,00" o un número → 65000.
 * null si no se entiende o tiene centavos.
 */
export function leerMonto(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isInteger(valor) ? valor : null;
  let s = String(valor ?? "").replace(/[$\s]/g, "");
  if (!s) return null;
  if (s.includes(",")) {
    const [entero, decimales, ...resto] = s.split(",");
    if (resto.length || !/^0+$/.test(decimales)) return null;
    s = entero;
  }
  if (!/^-?\d{1,3}(\.\d{3})*$|^-?\d+$/.test(s)) return null;
  return Number(s.replace(/\./g, ""));
}

const dia = (iso: string) => new Date(`${iso}T00:00:00Z`);
const DIA = 86_400_000;

/** La fecha de corte: no antes de 2000 ni a más de un año. */
export function revisarFechaCorte(corte: Date, hoy: Date): string | null {
  if (Number.isNaN(corte.getTime())) return "Ingresa la fecha de corte.";
  if (corte < dia("2000-01-01")) return "La fecha de corte es demasiado antigua.";
  if (corte.getTime() - hoy.getTime() > 366 * DIA) return "La fecha de corte no puede estar a más de un año.";
  return null;
}

export type DeudaNueva = {
  periodo: string;
  concepto: string;
  montoOriginal?: number | null;
  abonos?: number | null;
  saldo: number;
  vencimiento?: Date | null;
};

/** Un concepto que en realidad es un total ("Total", "Saldo anterior", "Deuda acumulada"). */
const ES_TOTAL = /^(total|saldo|saldoanterior|deudatotal|deudaacumulada|acumulado|arrastre|subtotal)/;

/** Error de una deuda de apertura, o null si está bien. */
export function revisarDeuda(d: DeudaNueva, corte: Date): string | null {
  if (!Number.isInteger(d.saldo) || d.saldo <= 0) return "El saldo pendiente debe ser un monto mayor que 0, sin decimales.";
  if (d.periodo > corte.toISOString().slice(0, 7)) {
    return `El período ${textoPeriodo(d.periodo)} es posterior a la fecha de corte: ese cobro lo emite Convive.`;
  }
  if (ES_TOTAL.test(normalizarTitulo(d.concepto))) {
    return "Parece un total o saldo arrastrado: registra cada período y concepto por separado (el total lo calcula Convive).";
  }
  for (const [n, v] of [["monto original", d.montoOriginal], ["abonos", d.abonos]] as const) {
    if (v !== null && v !== undefined && (!Number.isInteger(v) || v < 0)) return `El ${n} debe ser 0 o más, sin decimales.`;
  }
  if (d.montoOriginal != null) {
    if (d.saldo > d.montoOriginal) return "El saldo pendiente es mayor que el monto original.";
    if (d.abonos != null && d.montoOriginal - d.abonos !== d.saldo) {
      return `No cuadra: monto original menos abonos da ${d.montoOriginal - d.abonos}, pero el saldo dice ${d.saldo}.`;
    }
  }
  return null;
}

/** Misma unidad, período y concepto = la misma deuda (sin tildes ni mayúsculas en el concepto). */
export const claveDeuda = (unidadId: string, periodo: string, concepto: string) => `${unidadId}|${periodo}|${normalizarTitulo(concepto)}`;

export type Tramo = "por vencer" | "0-30" | "31-90" | "91-180" | "más de 180";
export const TRAMOS: Tramo[] = ["por vencer", "0-30", "31-90", "91-180", "más de 180"];

/** Días de atraso a la fecha de corte: desde el vencimiento o, si no hay, desde el fin del mes de origen. */
export function tramoDe(d: { periodo: string; vencimiento?: Date | null }, corte: Date): Tramo {
  const [a, m] = d.periodo.split("-").map(Number);
  const vence = d.vencimiento ?? new Date(Date.UTC(a, m, 0));
  const dias = Math.floor((corte.getTime() - vence.getTime()) / DIA);
  if (dias < 0) return "por vencer";
  if (dias <= 30) return "0-30";
  if (dias <= 90) return "31-90";
  if (dias <= 180) return "91-180";
  return "más de 180";
}

export type DatosApertura = {
  fechaCorte: Date;
  deudas: (DeudaNueva & { unidadId: string; estado: EstadoDeuda })[];
  creditos: { unidadId: string | null; monto: number }[];
  fondos: { tipo: TipoFondo; saldoContable: number; pendienteRecaudar: number | null }[];
  cuentas: { saldoCartola: number; chequesNoCobrados: number; depositosNoAbonados: number }[];
  obligaciones: { monto: number; fondo: string | null }[];
};

const suma = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

/** Banco según cartola, ajustado por partidas en tránsito: lo que de verdad hay disponible. */
export const saldoAjustado = (c: DatosApertura["cuentas"][number]) => c.saldoCartola - c.chequesNoCobrados + c.depositosNoAbonados;

/** Totales de la apertura. Todo se calcula: ningún total se guarda. */
export function resumenApertura(d: DatosApertura) {
  const porEstado = Object.fromEntries(
    ORDEN_ESTADOS_DEUDA.map((e) => {
      const ds = d.deudas.filter((x) => x.estado === e);
      return [e, { cantidad: ds.length, monto: suma(ds.map((x) => x.saldo)) }];
    }),
  ) as Record<EstadoDeuda, { cantidad: number; monto: number }>;
  // Morosidad: confirmadas y en convenio. Discutidas y por verificar van aparte (D-COM-11, por decidir).
  const cobrables = d.deudas.filter((x) => x.estado === "CONFIRMADA" || x.estado === "EN_CONVENIO");
  const porTramo = Object.fromEntries(TRAMOS.map((t) => [t, 0])) as Record<Tramo, number>;
  for (const x of cobrables) porTramo[tramoDe(x, d.fechaCorte)] += x.saldo;

  const fondosContable = suma(d.fondos.map((f) => f.saldoContable));
  const bancoAjustado = suma(d.cuentas.map(saldoAjustado));
  const diferencia = bancoAjustado - fondosContable;
  return {
    deudas: {
      total: suma(d.deudas.map((x) => x.saldo)),
      cantidad: d.deudas.length,
      unidades: new Set(d.deudas.map((x) => x.unidadId)).size,
      cobrable: suma(cobrables.map((x) => x.saldo)),
      porEstado,
      porTramo,
    },
    creditos: {
      aFavor: suma(d.creditos.filter((c) => c.unidadId).map((c) => c.monto)),
      porIdentificar: suma(d.creditos.filter((c) => !c.unidadId).map((c) => c.monto)),
    },
    fondos: {
      contable: fondosContable,
      pendiente: suma(d.fondos.map((f) => f.pendienteRecaudar ?? 0)),
      reserva: suma(d.fondos.filter((f) => f.tipo === "RESERVA").map((f) => f.saldoContable)),
    },
    bancos: {
      cartola: suma(d.cuentas.map((c) => c.saldoCartola)),
      ajustado: bancoAjustado,
    },
    obligaciones: { total: suma(d.obligaciones.map((o) => o.monto)), sinFondo: d.obligaciones.filter((o) => !o.fondo).length },
    cuadre: {
      diferencia,
      nivel: diferencia === 0 ? ("cuadra" as const) : Math.abs(diferencia) <= UMBRAL_DIFERENCIA ? ("menor" as const) : ("mayor" as const),
    },
  };
}

export type Resumen = ReturnType<typeof resumenApertura>;

/**
 * ¿Se puede marcar lista para revisión? Bloqueos y advertencias. Aprobarla (y que cuente en
 * cobros, pagos e intereses) no existe todavía: está restringido hasta aprobar las reglas.
 */
export function revisarApertura(d: DatosApertura, r: Resumen) {
  const bloqueos: string[] = [];
  const advertencias: string[] = [];
  if (d.cuentas.length === 0) bloqueos.push("Registra al menos una cuenta bancaria o caja (aunque su saldo sea 0).");
  if (d.fondos.length === 0) bloqueos.push("Registra al menos un fondo (aunque su saldo sea 0).");
  if (d.deudas.length === 0) advertencias.push("No hay deudas registradas: confirma que ninguna unidad debía nada a la fecha de corte.");
  const cuantas = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
  if (r.deudas.porEstado.POR_VERIFICAR.cantidad) advertencias.push(`${cuantas(r.deudas.porEstado.POR_VERIFICAR.cantidad, "deuda", "deudas")} por verificar.`);
  if (r.deudas.porEstado.DISCUTIDA.cantidad) advertencias.push(`${cuantas(r.deudas.porEstado.DISCUTIDA.cantidad, "deuda discutida", "deudas discutidas")}.`);
  if (r.creditos.porIdentificar) advertencias.push("Hay pagos por identificar: asígnalos a su unidad cuando se sepa de quién son.");
  if (r.obligaciones.sinFondo) advertencias.push(`${cuantas(r.obligaciones.sinFondo, "obligación", "obligaciones")} con terceros sin fondo que las pague.`);
  if (d.cuentas.length && d.fondos.length && r.cuadre.nivel !== "cuadra") {
    advertencias.push(
      `El banco ajustado no calza con los fondos: diferencia de ${r.cuadre.diferencia.toLocaleString("es-CL")} pesos` +
        (r.cuadre.nivel === "mayor" ? ` (más de ${UMBRAL_DIFERENCIA.toLocaleString("es-CL")}: según la recomendación D-COM-07 bloquearía la habilitación financiera).` : "."),
    );
  }
  return { ok: bloqueos.length === 0, bloqueos, advertencias };
}

// ── Deudas desde planilla ──────────────────────────────────────────────────

export const COLUMNAS_DEUDA = [
  { clave: "unidad", titulo: "Unidad", ayuda: "Número de la unidad, igual que en Convive (101, Casa 4). Obligatorio.", nombres: ["unidad", "depto", "departamento", "numero", "nro", "dpto", "casa"] },
  { clave: "periodo", titulo: "Período", ayuda: "Mes de origen de la deuda: 09-2026 o septiembre 2026. Obligatorio.", nombres: ["periodo", "mes", "periododeorigen", "mesdeorigen"] },
  { clave: "concepto", titulo: "Concepto", ayuda: `${CONCEPTOS.join(", ")}. Vacío = Gasto común. Nunca "Total" ni "Saldo anterior".`, nombres: ["concepto", "detalle", "glosa", "item"] },
  { clave: "montoOriginal", titulo: "Monto original", ayuda: "Lo que se cobró ese mes. Opcional.", nombres: ["montooriginal", "monto", "cobrado", "emitido", "original"] },
  { clave: "abonos", titulo: "Abonos", ayuda: "Lo que ya se pagó de ese cobro. Opcional.", nombres: ["abonos", "abono", "pagado", "pagos"] },
  { clave: "saldo", titulo: "Saldo pendiente", ayuda: "Lo que se debe a la fecha de corte. Obligatorio, mayor que 0.", nombres: ["saldopendiente", "saldo", "deuda", "pendiente", "adeudado"] },
  { clave: "vencimiento", titulo: "Vencimiento", ayuda: "Fecha de vencimiento (05-10-2026). Opcional.", nombres: ["vencimiento", "fechavencimiento", "vence"] },
  { clave: "estado", titulo: "Estado", ayuda: "Confirmada, Discutida, En convenio o Por verificar. Vacío = Confirmada.", nombres: ["estado", "situacion"] },
  { clave: "observaciones", titulo: "Observaciones", ayuda: "Opcional.", nombres: ["observaciones", "observacion", "obs", "comentario", "nota"] },
] as const;
type ClaveDeuda = (typeof COLUMNAS_DEUDA)[number]["clave"];

const ESTADO_POR_TEXTO: [RegExp, EstadoDeuda][] = [
  [/^$|confirm/, "CONFIRMADA"],
  [/discut|reclam|objet/, "DISCUTIDA"],
  [/convenio/, "EN_CONVENIO"],
  [/verific|revis|pendiente/, "POR_VERIFICAR"],
];

export type FilaDeuda = DeudaNueva & { fila: number; unidad: string; estado: EstadoDeuda; observaciones?: string };
export type ErrorDeuda = { fila: number; mensaje: string; hoja?: string };

const letra = (i: number): string => (i < 26 ? "" : letra(Math.floor(i / 26) - 1)) + String.fromCharCode(65 + (i % 26));
const celdaTexto = (v: unknown) => {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
};

/**
 * Lee la hoja de deudas: la primera fila con "Unidad" y "Saldo" son los títulos. Cada error dice
 * hoja, fila y columna. No mira la base: las unidades y repeticiones se revisan en el servicio.
 */
export function leerDeudas(hoja: unknown[][], corte: Date, nombreHoja?: string): { filas: FilaDeuda[]; errores: ErrorDeuda[] } {
  const claveDe = (t: unknown): ClaveDeuda | undefined => {
    const n = normalizarTitulo(String(t ?? ""));
    return n ? COLUMNAS_DEUDA.find((c) => (c.nombres as readonly string[]).includes(n))?.clave : undefined;
  };
  const iTitulos = hoja.findIndex((f) => {
    const claves = f.map(claveDe);
    return claves.includes("unidad") && claves.includes("saldo");
  });
  if (iTitulos === -1) {
    return { filas: [], errores: [{ fila: 0, hoja: nombreHoja, mensaje: 'No encontré las columnas "Unidad" y "Saldo pendiente". Usa la planilla de deudas de Convive.' }] };
  }
  const indice: Partial<Record<ClaveDeuda, number>> = {};
  hoja[iTitulos].forEach((t, i) => {
    const c = claveDe(t);
    if (c && indice[c] === undefined) indice[c] = i;
  });
  const col = (c: ClaveDeuda) => (indice[c] === undefined ? "" : ` (columna ${letra(indice[c]!)}, "${String(hoja[iTitulos][indice[c]!]).trim()}")`);

  const filas: FilaDeuda[] = [];
  const errores: ErrorDeuda[] = [];
  for (let i = iTitulos + 1; i < hoja.length; i++) {
    const celda = (c: ClaveDeuda) => (indice[c] === undefined ? undefined : hoja[i][indice[c]!]);
    if (Object.keys(indice).every((c) => celdaTexto(celda(c as ClaveDeuda)) === undefined)) continue;
    const n = i + 1;
    const problemas: string[] = [];
    const unidad = celdaTexto(celda("unidad"));
    if (!unidad) problemas.push(`falta la unidad${col("unidad")}`);
    else if (ES_TOTAL.test(normalizarTitulo(unidad))) problemas.push(`es una fila de totales${col("unidad")}: quítala, Convive suma solo`);
    const periodoTxt = celdaTexto(celda("periodo"));
    const periodo = periodoTxt ? leerPeriodo(celda("periodo")) : null;
    if (!periodoTxt) problemas.push(`falta el período${col("periodo")}`);
    else if (!periodo) problemas.push(`no entiendo el período "${periodoTxt}" (usa 09-2026)${col("periodo")}`);
    const concepto = celdaTexto(celda("concepto")) ?? "Gasto común";
    const esTotal = ES_TOTAL.test(normalizarTitulo(concepto));
    if (esTotal) problemas.push(`parece un total o saldo arrastrado${col("concepto")}: registra cada período y concepto por separado (el total lo calcula Convive)`);
    const montos: Partial<Record<"montoOriginal" | "abonos" | "saldo", number | null>> = {};
    for (const c of ["montoOriginal", "abonos", "saldo"] as const) {
      const t = celdaTexto(celda(c));
      if (t === undefined) continue;
      const m = leerMonto(celda(c));
      if (m === null) problemas.push(`el monto "${t}" no es un número en pesos sin decimales${col(c)}`);
      else montos[c] = m;
    }
    if (celdaTexto(celda("saldo")) === undefined) problemas.push(`falta el saldo pendiente${col("saldo")}`);
    let vencimiento: Date | null = null;
    const vt = celdaTexto(celda("vencimiento"));
    if (vt) {
      const f = leerFecha(celda("vencimiento") instanceof Date ? celda("vencimiento") : vt);
      if (!f) problemas.push(`no entiendo la fecha "${vt}" (usa 05-10-2026)${col("vencimiento")}`);
      else vencimiento = dia(f);
    }
    const et = normalizarTitulo(celdaTexto(celda("estado")) ?? "");
    const estado = ESTADO_POR_TEXTO.find(([re]) => re.test(et))?.[1];
    if (!estado) problemas.push(`no reconozco el estado "${celdaTexto(celda("estado"))}"${col("estado")}`);
    if (!problemas.length) {
      const d: FilaDeuda = {
        fila: n,
        unidad: unidad!,
        periodo: periodo!,
        concepto,
        montoOriginal: montos.montoOriginal ?? null,
        abonos: montos.abonos ?? null,
        saldo: montos.saldo!,
        vencimiento,
        estado: estado!,
        observaciones: celdaTexto(celda("observaciones"))?.slice(0, 300),
      };
      const error = revisarDeuda(d, corte);
      if (error && !esTotal) problemas.push(error.charAt(0).toLowerCase() + error.slice(1).replace(/\.$/, ""));
      else filas.push(d);
    }
    if (problemas.length) errores.push({ fila: n, hoja: nombreHoja, mensaje: `${unidad ? `Unidad ${unidad}: ` : ""}${problemas.join("; ")}.` });
  }
  return { filas, errores };
}

/** Clave de una deuda leída de la planilla, por número de unidad (antes de saber su id). */
export const claveFila = (f: { unidad: string; periodo: string; concepto: string }) => claveDeuda(f.unidad.toLowerCase(), f.periodo, f.concepto);
