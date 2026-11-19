// FIN-003.1 · Importador de cartolas bancarias: lectura e interpretación (puro, sin base de datos).
// Reutiliza las piezas del interpretador de planillas de COM-001 (src/lib/importacion.ts):
// títulos normalizados, columnas con ejemplos, perfiles que calzan por títulos y lectura de CSV.
// Este archivo también lo usa la pantalla (tipos y textos), así que no importa nada del servidor.

import { celdaTexto, columnasReconocidas, letraColumna, normalizarTitulo } from "./importacion";

// ---------------------------------------------------------------------------
// Campos de Convive

export const CAMPOS_CARTOLA = [
  { clave: "fecha", titulo: "Fecha", ayuda: "Fecha del movimiento. Obligatoria." },
  { clave: "descripcion", titulo: "Descripción", ayuda: "Glosa o detalle que pone el banco." },
  { clave: "referencia", titulo: "Referencia", ayuda: "N° de operación, documento o comprobante. Sirve para no duplicar." },
  { clave: "cargo", titulo: "Cargos", ayuda: "Columna de cargos, giros o débitos (salidas de dinero)." },
  { clave: "abono", titulo: "Abonos", ayuda: "Columna de abonos, depósitos o créditos (entradas de dinero)." },
  { clave: "monto", titulo: "Monto (una sola columna)", ayuda: "Cuando el banco usa una sola columna con montos positivos y negativos." },
  { clave: "saldo", titulo: "Saldo bancario", ayuda: "Saldo después del movimiento. Sirve para comprobar la lectura y detectar duplicados." },
  { clave: "contraparte", titulo: "Emisor o receptor", ayuda: "Nombre de quien transfiere o recibe." },
  { clave: "rutContraparte", titulo: "RUT emisor o receptor", ayuda: "RUT de quien transfiere o recibe." },
  { clave: "otro", titulo: "Otro dato útil", ayuda: "Sucursal, canal u otro dato: se guarda junto al movimiento." },
] as const;

export type CampoCartola = (typeof CAMPOS_CARTOLA)[number]["clave"];
export type DestinoCartola = CampoCartola | "ignorar";
/** Título de columna normalizado → campo de Convive. */
export type MapeoCartola = Record<string, DestinoCartola>;

export const tituloCampo = (c: DestinoCartola) => (c === "ignorar" ? "No utilizar" : CAMPOS_CARTOLA.find((x) => x.clave === c)!.titulo);

export type FormatoFecha = "AUTO" | "DMA" | "MDA" | "AMD";
export type SeparadorDecimal = "AUTO" | "COMA" | "PUNTO";
export type SignoMonto = "POSITIVO_ABONO" | "POSITIVO_CARGO";
export type Formatos = { fecha: FormatoFecha; decimal: SeparadorDecimal; signo: SignoMonto };
export const FORMATOS_INICIALES: Formatos = { fecha: "AUTO", decimal: "AUTO", signo: "POSITIVO_ABONO" };

export const TEXTO_FORMATO_FECHA: Record<FormatoFecha, string> = {
  AUTO: "Reconocer solo (día-mes-año si hay duda)",
  DMA: "Día-mes-año (31-12-2026)",
  MDA: "Mes-día-año (12-31-2026)",
  AMD: "Año-mes-día (2026-12-31)",
};
export const TEXTO_SEPARADOR: Record<SeparadorDecimal, string> = {
  AUTO: "Reconocer solo (punto de miles si hay duda)",
  COMA: "Coma decimal: 1.234.567,50",
  PUNTO: "Punto decimal: 1,234,567.50",
};
export const TEXTO_SIGNO: Record<SignoMonto, string> = {
  POSITIVO_ABONO: "Positivo = abono, negativo = cargo",
  POSITIVO_CARGO: "Positivo = cargo, negativo = abono",
};

/** Bancos que operan en Chile, para elegir al registrar una cuenta o un perfil. */
export const BANCOS = [
  "BancoEstado",
  "Banco de Chile",
  "Banco Santander",
  "Banco BCI",
  "Scotiabank",
  "Banco Itaú",
  "Banco BICE",
  "Banco Security",
  "Banco Falabella",
  "Banco Ripley",
  "Banco Consorcio",
  "Banco Internacional",
  "HSBC",
  "Coopeuch",
  "Otro",
];

export const TIPOS_CUENTA = { CORRIENTE: "Cuenta corriente", VISTA: "Cuenta vista", AHORRO: "Cuenta de ahorro" } as const;

/** Estados de un movimiento guardado (FIN-003.2 usará «Coincidencia sugerida» y «Conciliado»). */
export const ESTADOS_CONCILIACION = {
  PENDIENTE: { texto: "Pendiente de identificar", tono: "neutro" },
  SUGERIDA: { texto: "Coincidencia sugerida", tono: "marca" },
  CONCILIADO: { texto: "Conciliado", tono: "exito" },
  REVISAR: { texto: "Requiere revisión", tono: "alerta" },
} as const;
export type EstadoConciliacion = keyof typeof ESTADOS_CONCILIACION;

// ---------------------------------------------------------------------------
// Reconocer columnas por su título

const SINONIMOS: Record<Exclude<CampoCartola, "otro">, string[]> = {
  fecha: [
    "fecha", "fechamovimiento", "fechatransaccion", "fechaoperacion", "fechacontable", "fechadeoperacion",
    "fechadetransaccion", "fechadelmovimiento", "fechamov", "fec", "dia",
  ],
  descripcion: [
    "descripcion", "glosa", "detalle", "detallemovimiento", "detalledelmovimiento", "concepto", "movimiento",
    "descripciondelmovimiento", "descripcionmovimiento", "transaccion", "glosamovimiento", "detalletransaccion",
    "descripcionoperacion", "glosadelmovimiento",
  ],
  referencia: [
    "referencia", "nrooperacion", "numerooperacion", "numerodeoperacion", "noperacion", "ndeoperacion", "nrodocumento",
    "numerodocumento", "numerodedocumento", "ndocumento", "ndedocumento", "documento", "nrodoc", "ndoc", "folio", "operacion",
    "comprobante", "idtransaccion", "codigotransaccion", "nreferencia", "nroreferencia", "numerotransaccion", "ncheque",
    "nrocheque", "serie", "nrodeoperacion", "codigooperacion", "idoperacion",
  ],
  cargo: [
    "cargo", "cargos", "giro", "giros", "debito", "debitos", "egreso", "egresos", "retiro", "retiros", "chequesyotroscargos",
    "otroscargos", "cargosclp", "montocargo", "salida", "salidas", "cargosgiros",
  ],
  abono: [
    "abono", "abonos", "deposito", "depositos", "credito", "creditos", "ingreso", "ingresos", "depositosyotrosabonos",
    "depositosyabonos", "otrosabonos", "abonosclp", "montoabono", "entrada", "entradas", "abonosdepositos",
  ],
  monto: ["monto", "importe", "valor", "montoclp", "montotransaccion", "montomovimiento", "montooperacion", "montopesos"],
  saldo: ["saldo", "saldodisponible", "saldocontable", "saldofinal", "saldodiario", "saldoclp", "saldoactual"],
  contraparte: [
    "nombre", "nombreorigen", "nombredestino", "ordenante", "origen", "destinatario", "beneficiario", "contraparte", "emisor",
    "receptor", "nombreemisor", "remitente", "nombrecontraparte", "nombredelordenante", "nombreordenante", "nombrebeneficiario",
  ],
  rutContraparte: [
    "rut", "rutorigen", "rutdestino", "rutemisor", "rutordenante", "rutbeneficiario", "rutcontraparte", "rutremitente",
    "rutdestinatario", "rutreceptor",
  ],
};

/** Columnas que no son un campo de Convive pero vale la pena guardar con el movimiento. */
const OTROS = [
  "sucursal", "canal", "oficina", "tipomovimiento", "tipodemovimiento", "tipotransaccion", "categoria", "fechavalor",
  "bancoorigen", "bancodestino", "comentario", "observacion", "observaciones", "mensaje", "codigo",
];

/** Palabras que, contenidas en el título, delatan el campo (el orden importa: "saldo" antes que "abono"). */
const CONTIENE: [RegExp, CampoCartola][] = [
  [/saldo/, "saldo"],
  [/^rut|rut$/, "rutContraparte"],
  [/cargo|giro|debito|egreso/, "cargo"],
  [/abono|deposito|credito|ingreso/, "abono"],
  [/glosa|descripcion|detalle/, "descripcion"],
  [/^fecha/, "fecha"],
  [/operacion|documento|referencia|comprobante/, "referencia"],
  [/^monto|^importe/, "monto"],
];

/** Qué campo de Convive es una columna según su título; undefined si no se reconoce. */
export function campoDe(titulo: string): CampoCartola | undefined {
  const t = normalizarTitulo(titulo);
  if (!t) return undefined;
  for (const [campo, nombres] of Object.entries(SINONIMOS) as [CampoCartola, string[]][]) if (nombres.includes(t)) return campo;
  if (OTROS.includes(t)) return "otro";
  for (const [campo, nombres] of Object.entries(SINONIMOS) as [CampoCartola, string[]][]) {
    if (nombres.some((n) => n.length >= 5 && t.startsWith(n))) return campo;
  }
  return CONTIENE.find(([re]) => re.test(t))?.[1];
}

const campoCon = (titulo: string, mapeo?: MapeoCartola): CampoCartola | undefined => {
  const n = normalizarTitulo(titulo);
  if (mapeo && n in mapeo) return mapeo[n] === "ignorar" ? undefined : (mapeo[n] as CampoCartola);
  return campoDe(titulo);
};

export type ColumnaCartola = { indice: number; letra: string; titulo: string; clave?: CampoCartola; ejemplos: string[] };

export const columnasDeCartola = (datos: unknown[][], iTitulos: number, mapeo?: MapeoCartola): ColumnaCartola[] =>
  columnasReconocidas<CampoCartola>(datos, iTitulos, (t) => campoCon(t, mapeo), ["otro"]);

const tieneMontos = (claves: Set<CampoCartola | undefined>) => claves.has("monto") || claves.has("cargo") || claves.has("abono");

/** Fila de títulos: la primera (de las 40 primeras) con fecha y algún monto. -1 si no hay. */
export function filaTitulosCartola(datos: unknown[][], mapeo?: MapeoCartola) {
  return datos.slice(0, 40).findIndex((fila) => {
    const claves = new Set(fila.map((c) => campoCon(String(c ?? ""), mapeo)));
    return claves.has("fecha") && tieneMontos(claves);
  });
}

/**
 * Cuando no se reconocen los títulos: la fila (de las 30 primeras) con más celdas de texto que no son
 * fechas ni montos. Así se salta el encabezado del banco (nombre, cuenta, período) y las filas de datos.
 */
export function filaProbableTitulos(datos: unknown[][]) {
  let mejor = -1;
  let maximo = 1;
  datos.slice(0, 30).forEach((f, i) => {
    const n = f.filter((c) => {
      const s = celdaTexto(c);
      return s !== undefined && typeof c !== "number" && !/\d/.test(s.replace(/n[°º]|nro\.?/gi, ""));
    }).length;
    if (n > maximo) [mejor, maximo] = [i, n];
  });
  return mejor;
}

// ---------------------------------------------------------------------------
// Montos

/** Limpia "$ -1.234", "(1.234)", "1.234-" o "1.234 CLP": devuelve el signo y solo los dígitos y separadores. */
function partesMonto(valor: string): { negativo: boolean; cuerpo: string } | null {
  let s = valor.replace(/[\s ]/g, "").replace(/^(CLP|US\$|USD|\$)|(CLP|USD|\$)$/gi, "").replace(/\$/g, "");
  let negativo = false;
  if (/^\(.*\)$/.test(s)) [negativo, s] = [true, s.slice(1, -1)];
  if (s.startsWith("-")) [negativo, s] = [!negativo, s.slice(1)];
  else if (s.startsWith("+")) s = s.slice(1);
  else if (s.endsWith("-")) [negativo, s] = [!negativo, s.slice(0, -1)];
  s = s.replace(/^\$/, "");
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  return { negativo, cuerpo: s };
}

/**
 * Qué separador decimal usa una columna, mirando todos sus valores escritos como texto.
 * Un valor como "1.234.567" o "1.234,5" no deja dudas; "1.234" sí (¿mil doscientos o 1,234?):
 * si nada lo aclara se usa la costumbre chilena (punto de miles) y se avisa.
 */
export function separadorDe(valores: unknown[]): { separador: "COMA" | "PUNTO"; seguro: boolean; dudosos: number } {
  let coma = 0;
  let punto = 0;
  let dudosos = 0;
  for (const v of valores) {
    if (typeof v !== "string") continue;
    const p = partesMonto(v);
    if (!p) continue;
    const s = p.cuerpo;
    const iP = s.lastIndexOf(".");
    const iC = s.lastIndexOf(",");
    if (iP >= 0 && iC >= 0) {
      if (iC > iP) coma++;
      else punto++;
    } else if (iP >= 0 || iC >= 0) {
      const sep = iP >= 0 ? "." : ",";
      const veces = s.split(sep).length - 1;
      const despues = s.length - s.lastIndexOf(sep) - 1;
      if (veces > 1) {
        // "1.234.567": varios separadores iguales son de miles.
        if (sep === ".") coma++;
        else punto++;
      } else if (despues === 3) dudosos++;
      else if (sep === ",") coma++;
      else punto++;
    }
  }
  if (coma && !punto) return { separador: "COMA", seguro: true, dudosos };
  if (punto && !coma) return { separador: "PUNTO", seguro: true, dudosos };
  return { separador: "COMA", seguro: dudosos === 0 && coma === 0 && punto === 0, dudosos };
}

const MONTO_MAXIMO = 1e13;

/** Lee un monto con el separador decimal indicado. null si el texto no es un monto claro. */
export function leerMonto(valor: unknown, separador: "COMA" | "PUNTO"): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) && Math.abs(valor) < MONTO_MAXIMO ? Math.round(valor * 100) / 100 : null;
  const p = partesMonto(String(valor ?? ""));
  if (!p) return null;
  const [miles, decimal] = separador === "COMA" ? [".", ","] : [",", "."];
  const m = miles === "." ? "\\." : ",";
  const d = decimal === "." ? "\\." : ",";
  const valido = new RegExp(`^(\\d{1,3}(${m}\\d{3})+|\\d+)(${d}\\d+)?$`);
  if (!valido.test(p.cuerpo)) return null;
  const n = Number(p.cuerpo.split(miles).join("").replace(decimal, "."));
  if (!Number.isFinite(n) || n >= MONTO_MAXIMO) return null;
  return Math.round((p.negativo ? -n : n) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Fechas

const MESES: Record<string, number> = {
  ene: 1, enero: 1, jan: 1, january: 1,
  feb: 2, febrero: 2, february: 2,
  mar: 3, marzo: 3, march: 3,
  abr: 4, abril: 4, apr: 4, april: 4,
  may: 5, mayo: 5,
  jun: 6, junio: 6, june: 6,
  jul: 7, julio: 7, july: 7,
  ago: 8, agosto: 8, aug: 8, august: 8,
  sep: 9, sept: 9, set: 9, septiembre: 9, setiembre: 9, september: 9,
  oct: 10, octubre: 10, october: 10,
  nov: 11, noviembre: 11, november: 11,
  dic: 12, diciembre: 12, dec: 12, december: 12,
};

const iso = (a: number, m: number, d: number) => {
  if (a < 100) a += 2000;
  const f = new Date(Date.UTC(a, m - 1, d));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d || a < 1990 || a > 2100) return null;
  return f.toISOString().slice(0, 10);
};

/** "31/12/2026 10:32" → ["31","12","2026"] (sin la hora); null si no tiene forma de fecha numérica. */
const partesFecha = (s: string) => s.replace(/[ T]\d{1,2}:\d{2}(:\d{2})?(\.\d+)?Z?$/, "").trim().match(/^(\d{1,4})[-/.](\d{1,2})[-/.](\d{2,4})$/);

/**
 * Qué orden usan las fechas de una columna: si algún día pasa de 12 se sabe; si no, se usa el
 * orden chileno (día-mes-año) y `seguro` queda en false.
 */
export function formatoFechaDe(valores: unknown[]): { formato: "DMA" | "MDA"; seguro: boolean; conflicto: boolean } {
  let dma = false;
  let mda = false;
  let dudosas = false;
  for (const v of valores) {
    if (typeof v !== "string") continue;
    const p = partesFecha(v.trim());
    if (!p || p[1].length === 4) continue;
    const [a, b] = [Number(p[1]), Number(p[2])];
    if (a > 12 && b <= 12) dma = true;
    else if (b > 12 && a <= 12) mda = true;
    else if (a !== b) dudosas = true;
  }
  if (mda && !dma) return { formato: "MDA", seguro: true, conflicto: false };
  return { formato: "DMA", seguro: dma || !dudosas, conflicto: dma && mda };
}

/**
 * Lee la fecha de una celda: fecha de Excel, "31-12-2026", "31/12/26", "2026-12-31", "31-dic-2026",
 * "31 de diciembre de 2026" o un número de serie de Excel. null si no se entiende (nunca se adivina el año).
 */
export function leerFechaCartola(valor: unknown, formato: "DMA" | "MDA" | "AMD" = "DMA"): string | null {
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor.toISOString().slice(0, 10);
  if (typeof valor === "number") {
    // Número de serie de Excel (días desde el 30-12-1899): entre 1990 y 2100.
    if (!Number.isInteger(Math.floor(valor)) || valor < 32874 || valor > 73415) return null;
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(valor) * 86_400_000).toISOString().slice(0, 10);
  }
  const s = String(valor ?? "").trim().toLowerCase();
  if (!s) return null;
  let r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})([ t]\d{1,2}:\d{2}(:\d{2})?(\.\d+)?z?)?$/);
  if (r) return iso(Number(r[1]), Number(r[2]), Number(r[3]));
  const p = partesFecha(s);
  if (p) {
    const [x, y, z] = [Number(p[1]), Number(p[2]), Number(p[3])];
    if (p[1].length === 4) return iso(x, y, z);
    if (p[3].length === 3) return null;
    if (formato === "AMD") return p[1].length === 2 && p[3].length === 2 ? iso(x, y, z) : null;
    return formato === "MDA" ? iso(z, x, y) : iso(z, y, x);
  }
  r = s.replace(/\s+de\s+/g, " ").match(/^(\d{1,2})[\s\-/.]+([a-záéíóú]{3,10})\.?[\s\-/.,]+(\d{2,4})$/);
  if (r) {
    const mes = MESES[r[2].normalize("NFD").replace(/[̀-ͯ]/g, "")];
    return mes ? iso(Number(r[3]), mes, Number(r[1])) : null;
  }
  r = s.match(/^(19|20)(\d{2})(\d{2})(\d{2})$/);
  if (r) return iso(Number(r[1] + r[2]), Number(r[3]), Number(r[4]));
  return null;
}

// ---------------------------------------------------------------------------
// Leer una hoja

export type MovimientoLeido = {
  hoja: string;
  fila: number;
  fecha: string;
  descripcion?: string;
  referencia?: string;
  /** Abono positivo, cargo negativo. */
  monto: number;
  saldo?: number;
  contraparte?: string;
  rutContraparte?: string;
  otros?: Record<string, string>;
};

export type ErrorCartola = { hoja: string; fila: number; mensaje: string };

export type LecturaCartola = {
  movimientos: MovimientoLeido[];
  errores: ErrorCartola[];
  avisos: string[];
  columnas: ColumnaCartola[];
  /** No se encontró una fila de títulos con fecha y montos: hay que asignar las columnas a mano. */
  sinTitulos: boolean;
  /** Formatos con que se leyó (los detectados cuando estaban en "AUTO"). */
  usados: { fecha: "DMA" | "MDA" | "AMD"; decimal: "COMA" | "PUNTO"; signo: SignoMonto };
  /** Filas que no son movimientos (totales, saldos iniciales, títulos repetidos). */
  omitidas: number[];
  /** Comprobación con la columna de saldo: filas donde el saldo no cuadra con el monto. */
  saldo?: { revisados: number; descuadres: number[] };
};

export type OpcionesCartola = { mapeo?: MapeoCartola; formatos?: Formatos; hoy?: string };

const FILA_NO_MOVIMIENTO = /^(saldo|total|subtotal|totales|resumen|movimientos? del|cantidad de)/;
const MAXIMO_OTROS = 8;

/** Lee los movimientos de una hoja de cartola. No inventa nada: una fila dudosa queda como error con su hoja y fila. */
export function leerHojaCartola(nombre: string, datos: unknown[][], opciones: OpcionesCartola = {}): LecturaCartola {
  const { mapeo, hoy } = opciones;
  const formatos = opciones.formatos ?? FORMATOS_INICIALES;
  const errores: ErrorCartola[] = [];
  const avisos: string[] = [];
  const omitidas: number[] = [];
  const vacia = (): LecturaCartola => ({
    movimientos: [],
    errores,
    avisos,
    columnas: [],
    sinTitulos: true,
    usados: { fecha: "DMA", decimal: "COMA", signo: formatos.signo },
    omitidas,
  });

  const iTitulos = filaTitulosCartola(datos, mapeo);
  if (iTitulos === -1) {
    const iProbable = filaProbableTitulos(datos);
    return { ...vacia(), columnas: iProbable === -1 ? [] : columnasDeCartola(datos, iProbable, mapeo) };
  }
  const columnas = columnasDeCartola(datos, iTitulos, mapeo);
  const indice = (c: CampoCartola) => columnas.find((x) => x.clave === c)?.indice;
  const iFecha = indice("fecha")!;
  const [iMonto, iCargo, iAbono, iSaldo] = [indice("monto"), indice("cargo"), indice("abono"), indice("saldo")];
  const usarMonto = iMonto !== undefined && iCargo === undefined && iAbono === undefined;
  if (iMonto !== undefined && !usarMonto) avisos.push(`Hoja «${nombre}»: hay columnas de cargos o abonos y también de monto; se usaron las de cargos y abonos.`);
  const otros = columnas.filter((c) => c.clave === "otro");
  const col = (i: number | undefined) => {
    const c = columnas.find((x) => x.indice === i);
    return c ? ` (columna ${c.letra}, «${c.titulo}»)` : "";
  };

  const filas = datos.slice(iTitulos + 1);
  const columnaDe = (i: number | undefined) => (i === undefined ? [] : filas.map((f) => f[i]));

  // Formatos: lo que diga el perfil o el asistente; si es "AUTO", lo que muestren los valores.
  const fechaAuto = formatoFechaDe(columnaDe(iFecha));
  const fechaUsada = formatos.fecha === "AUTO" ? fechaAuto.formato : formatos.fecha;
  if (formatos.fecha === "AUTO") {
    if (fechaAuto.conflicto) avisos.push(`Hoja «${nombre}»: las fechas mezclan día-mes y mes-día. Se leyeron como día-mes-año; las que no calzan quedan con error.`);
    else if (!fechaAuto.seguro) avisos.push(`Hoja «${nombre}»: las fechas se leyeron como día-mes-año (como en Chile). Si el banco usa mes-día, cámbialo en «Cambiar columnas».`);
    else if (fechaAuto.formato === "MDA") avisos.push(`Hoja «${nombre}»: las fechas vienen como mes-día-año y se leyeron así.`);
  }
  const valoresMonto = [iMonto, iCargo, iAbono, iSaldo].flatMap((i) => columnaDe(i));
  const sepAuto = separadorDe(valoresMonto);
  const decimalUsado = formatos.decimal === "AUTO" ? sepAuto.separador : formatos.decimal;
  if (formatos.decimal === "AUTO" && !sepAuto.seguro && sepAuto.dudosos > 0) {
    avisos.push(
      `Hoja «${nombre}»: montos como «1.234» se leyeron con punto de miles (mil doscientos treinta y cuatro), como en Chile. Si el banco usa punto decimal, cámbialo en «Cambiar columnas».`,
    );
  }
  const titulosNormalizados = new Set((datos[iTitulos] ?? []).map((c) => normalizarTitulo(String(c ?? ""))).filter(Boolean));

  const movimientos: MovimientoLeido[] = [];
  filas.forEach((f, k) => {
    const n = iTitulos + k + 2; // fila de Excel (empieza en 1)
    const usadas = columnas.filter((c) => c.clave).map((c) => celdaTexto(f[c.indice]));
    if (usadas.every((v) => v === undefined)) return; // fila vacía
    // Títulos repetidos (cartolas de varias páginas).
    const normalizadas = f.map((c) => normalizarTitulo(String(c ?? ""))).filter(Boolean);
    if (normalizadas.length && normalizadas.every((t) => titulosNormalizados.has(t))) return void omitidas.push(n);

    const descripcion = celdaTexto(f[indice("descripcion") ?? -1])?.slice(0, 300);
    const textoFila = normalizarTitulo(f.map((c) => (typeof c === "string" ? c : "")).join(" "));
    const pareceResumen = FILA_NO_MOVIMIENTO.test(normalizarTitulo(descripcion ?? "")) || (!celdaTexto(f[iFecha]) && FILA_NO_MOVIMIENTO.test(textoFila));
    const crudos = (usarMonto ? [iMonto] : [iCargo, iAbono]).map((i) => (i === undefined ? undefined : f[i]));
    const sinMontos = crudos.every((v) => celdaTexto(v) === undefined);

    const fechaCruda = f[iFecha];
    if (celdaTexto(fechaCruda) === undefined) {
      if (sinMontos || pareceResumen) return void omitidas.push(n);
      errores.push({ hoja: nombre, fila: n, mensaje: `Tiene montos pero le falta la fecha${col(iFecha)}.` });
      return;
    }
    const problemas: string[] = [];
    const fecha = leerFechaCartola(fechaCruda, fechaUsada);
    if (!fecha) {
      const sinAnio = /^\d{1,2}[-/.]\d{1,2}$/.test(String(fechaCruda).trim());
      problemas.push(sinAnio ? `la fecha «${celdaTexto(fechaCruda)}» no tiene año${col(iFecha)}` : `no entiendo la fecha «${celdaTexto(fechaCruda)}»${col(iFecha)}`);
    } else if (hoy && fecha > hoy) problemas.push(`la fecha ${fecha.split("-").reverse().join("-")} es futura${col(iFecha)}`);

    let monto: number | null = null;
    if (sinMontos) {
      if (pareceResumen) return void omitidas.push(n);
      problemas.push(usarMonto ? `no tiene monto${col(iMonto)}` : "no tiene cargo ni abono");
    } else if (usarMonto) {
      const m = leerMonto(f[iMonto!], decimalUsado);
      if (m === null) problemas.push(`no entiendo el monto «${celdaTexto(f[iMonto!])}»${col(iMonto)}`);
      else monto = formatos.signo === "POSITIVO_CARGO" ? -m : m;
    } else {
      const leer = (i: number | undefined) => {
        if (i === undefined || celdaTexto(f[i]) === undefined) return 0;
        const m = leerMonto(f[i], decimalUsado);
        if (m === null) problemas.push(`no entiendo el monto «${celdaTexto(f[i])}»${col(i)}`);
        return m === null ? null : Math.abs(m);
      };
      const cargo = leer(iCargo);
      const abono = leer(iAbono);
      if (cargo !== null && abono !== null) {
        if (cargo && abono) problemas.push("tiene cargo y abono a la vez");
        else monto = abono || -cargo;
      }
    }
    if (monto === 0) {
      if (pareceResumen || !problemas.length) return void omitidas.push(n);
    }
    let saldo: number | undefined;
    if (iSaldo !== undefined && celdaTexto(f[iSaldo]) !== undefined) {
      const s = leerMonto(f[iSaldo], decimalUsado);
      if (s === null) problemas.push(`no entiendo el saldo «${celdaTexto(f[iSaldo])}»${col(iSaldo)}`);
      else saldo = s;
    }
    if (problemas.length || monto === null || !fecha) {
      errores.push({ hoja: nombre, fila: n, mensaje: `${problemas.join("; ")}.`.replace(/^./, (c) => c.toUpperCase()) });
      return;
    }
    const referencia = celdaTexto(f[indice("referencia") ?? -1]);
    const extra = Object.fromEntries(
      otros
        .map((c) => [c.titulo.slice(0, 60), celdaTexto(f[c.indice])?.slice(0, 200)] as const)
        .filter((x): x is readonly [string, string] => x[1] !== undefined)
        .slice(0, MAXIMO_OTROS),
    );
    movimientos.push({
      hoja: nombre,
      fila: n,
      fecha,
      descripcion,
      referencia: referencia && typeof f[indice("referencia")!] === "number" ? String(f[indice("referencia")!]) : referencia?.slice(0, 80),
      monto,
      saldo,
      contraparte: celdaTexto(f[indice("contraparte") ?? -1])?.slice(0, 120),
      rutContraparte: celdaTexto(f[indice("rutContraparte") ?? -1])?.slice(0, 20),
      otros: Object.keys(extra).length ? extra : undefined,
    });
  });

  const sinUsar = columnas.filter((c) => !c.clave && mapeo?.[normalizarTitulo(c.titulo)] !== "ignorar").map((c) => `«${c.titulo}»`);
  if (sinUsar.length) avisos.push(`Hoja «${nombre}»: estas columnas no se usan: ${sinUsar.join(", ")}.`);
  if (iCargo === undefined && iAbono !== undefined && !usarMonto) avisos.push(`Hoja «${nombre}»: no hay columna de cargos; solo se leyeron abonos.`);
  if (iAbono === undefined && iCargo !== undefined && !usarMonto) avisos.push(`Hoja «${nombre}»: no hay columna de abonos; solo se leyeron cargos.`);

  return {
    movimientos,
    errores,
    avisos,
    columnas,
    sinTitulos: false,
    usados: { fecha: fechaUsada, decimal: decimalUsado, signo: formatos.signo },
    omitidas,
    saldo: comprobarSaldos(movimientos),
  };
}

/**
 * Comprobación con el saldo del banco: el saldo de una fila debe ser el saldo anterior informado más
 * los cargos y abonos entre ambos (muchos bancos ponen el saldo solo al final del día). Se prueba en
 * el orden de la cartola y al revés (más nuevo primero) y se queda con el que cuadra mejor. Si no
 * cuadra, puede haber una columna mal asignada o un monto mal leído. No cambia nada: solo avisa.
 */
export function comprobarSaldos(movs: Pick<MovimientoLeido, "fila" | "monto" | "saldo">[]): LecturaCartola["saldo"] {
  const cerca = (a: number, b: number) => Math.abs(a - b) < 0.005;
  const revisar = (lista: typeof movs) => {
    let ultimo: number | undefined;
    let acumulado = 0;
    let revisados = 0;
    const descuadres: number[] = [];
    for (const m of lista) {
      acumulado += m.monto;
      if (m.saldo === undefined) continue;
      if (ultimo !== undefined) {
        revisados++;
        if (!cerca(m.saldo, ultimo + acumulado)) descuadres.push(m.fila);
      }
      ultimo = m.saldo;
      acumulado = 0;
    }
    return { revisados, descuadres };
  };
  const asc = revisar(movs);
  if (asc.revisados < 2) return undefined;
  const desc = revisar([...movs].reverse());
  return desc.descuadres.length < asc.descuadres.length ? { ...desc, descuadres: desc.descuadres.sort((a, b) => a - b) } : asc;
}

/** Columnas obligatorias que faltan en una asignación: fecha y al menos un monto. */
export function faltantes(columnas: Pick<ColumnaCartola, "clave">[]): string[] {
  const claves = new Set(columnas.map((c) => c.clave));
  const faltan: string[] = [];
  if (!claves.has("fecha")) faltan.push("la fecha");
  if (!tieneMontos(claves)) faltan.push("los montos (cargos y abonos, o una columna de monto)");
  return faltan;
}

/** Revisa una asignación hecha a mano: fecha y montos, y cada campo en una sola columna (salvo «Otro dato»). */
export function revisarMapeoCartola(mapeo: MapeoCartola): string | null {
  const usados = Object.values(mapeo).filter((d) => d !== "ignorar") as CampoCartola[];
  const faltan = faltantes(usados.map((clave) => ({ clave })));
  if (faltan.length) return `Indica qué columna tiene ${faltan.join(" y ")}.`;
  const repetido = usados.find((d, i) => d !== "otro" && usados.indexOf(d) !== i);
  if (repetido) return `«${tituloCampo(repetido)}» está asignado a dos columnas.`;
  if (usados.includes("monto") && (usados.includes("cargo") || usados.includes("abono"))) {
    return "Usa una columna de monto o columnas de cargos y abonos, no las dos cosas.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Estados que la pantalla muestra (los arma el servidor)

export type EstadoFila = "NUEVO" | "REGISTRADO" | "POSIBLE_DUPLICADO";
export const TEXTO_ESTADO_FILA: Record<EstadoFila | "ERROR", string> = {
  NUEVO: "Nuevo",
  REGISTRADO: "Ya registrado",
  POSIBLE_DUPLICADO: "Posible duplicado",
  ERROR: "Con error",
};

export type FilaRevision = MovimientoLeido & {
  huella: string;
  estado: EstadoFila;
  motivo?: string;
  /** El movimiento ya guardado que se parece (posible duplicado o ya registrado por parecido). */
  parecido?: { fecha: string; descripcion: string | null; referencia: string | null; monto: number; importado: string };
};

export type HojaInfo = { nombre: string; filas: number; reconocida: boolean; movimientos: number; elegida: boolean; perfil?: string };
export type InfoArchivo = { nombre: string; tamano: number; formato: "XLSX" | "CSV"; huella: string };

export type ResumenCartola = { encontrados: number; nuevos: number; registrados: number; porRevisar: number; errores: number };

type Comun = { archivo: InfoArchivo; hojas: HojaInfo[]; columnas: ColumnaCartola[]; formatos: Formatos; perfil?: { id: string; nombre: string; banco: string } };

export type EstadoCartola =
  | { etapa: "inicio"; mensaje?: string }
  | (Comun & { etapa: "columnas"; faltan: string[]; mensaje?: string })
  | (Comun & {
      etapa: "revision";
      resumen: ResumenCartola;
      filas: FilaRevision[];
      errores: ErrorCartola[];
      avisos: string[];
      periodo: { desde: string; hasta: string } | null;
      yaImportado?: { fecha: string; usuario: string };
      mensaje?: string;
      perfilGuardado?: string;
    })
  | { etapa: "listo"; importacionId: string; nuevos: number; omitidos: number; errores: number; periodo: { desde: string; hasta: string } | null };

/** Lo que la pantalla manda junto con el archivo. */
export type OpcionesEnvio = {
  hojas?: string[];
  mapeo?: MapeoCartola;
  formatos?: Formatos;
  guardarPerfil?: { nombre: string; banco: string };
  /** Posibles duplicados: huella → importar u omitir. */
  decisiones?: Record<string, "importar" | "omitir">;
  /** Procedimiento explícito para dejar fuera las filas con error. */
  omitirErrores?: boolean;
  /** Lo que mostró la vista previa: si cambió (otra persona importó), no se guarda. */
  esperado?: { nuevos: number; registrados: number; porRevisar: number };
};

export { letraColumna };
