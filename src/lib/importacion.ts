// Carga masiva de unidades y personas desde una planilla (Excel o CSV).
// Todo lo de este archivo es puro (sin base de datos) para poder probarlo:
// 1) leerPlanilla convierte las filas de la hoja en FilaImportada,
// 2) planificar compara con lo que ya existe y dice qué se va a crear o cambiar.

import { normalizarRut, revisarVinculo, TIPOS_VINCULO, type TipoVinculo } from "./vinculos";

export type Tipo = "DEPARTAMENTO" | "CASA" | "OFICINA" | "LOCAL" | "ESTACIONAMIENTO" | "BODEGA";
/** COM-001 · Entrega 4: la columna Relación acepta los cinco vínculos de la Entrega 3. */
export type Relacion = TipoVinculo;

/** Una fila de la planilla ya interpretada. Los campos vacíos quedan como undefined. */
export type FilaImportada = {
  fila: number; // número de fila en la planilla, para los mensajes
  numero?: string;
  tipo?: Tipo;
  alicuota?: number;
  nombre?: string;
  documento?: string;
  correo?: string;
  telefono?: string;
  relaciones: Relacion[];
  /** Fecha de inicio del vínculo ("2026-03-01"). Vacía = sin fecha registrada. */
  desde?: string;
};

/** Error de una fila, con la hoja para encontrarlo en Excel. */
export type ErrorFila = { fila: number; mensaje: string; hoja?: string };

export const COLUMNAS = [
  { clave: "numero", titulo: "Unidad", ayuda: "Número o nombre de la unidad (101, Casa 4, B-12). Obligatorio." },
  { clave: "tipo", titulo: "Tipo", ayuda: "Departamento, Casa, Oficina, Local, Estacionamiento o Bodega. Vacío = Departamento." },
  { clave: "alicuota", titulo: "Alícuota (%)", ayuda: "Porcentaje de participación (1,25 = 1,25 %). Obligatoria para unidades nuevas." },
  { clave: "nombre", titulo: "Nombre", ayuda: "Nombre completo del propietario o residente. Vacío = solo se carga la unidad." },
  { clave: "documento", titulo: "RUT", ayuda: "RUT o documento. Sirve para reconocer a la misma persona en varias unidades." },
  { clave: "correo", titulo: "Correo", ayuda: "Necesario para invitarlo a la app." },
  { clave: "telefono", titulo: "Teléfono", ayuda: "Celular, para mandarle la invitación por WhatsApp." },
  {
    clave: "relacion",
    titulo: "Relación",
    ayuda: "Propietario, Copropietario, Arrendatario, Residente u Ocupante. Puedes poner dos: \"Propietario y residente\" (o \"Ambos\"). Vacío = Propietario.",
  },
  { clave: "desde", titulo: "Desde", ayuda: "Fecha en que empezó el vínculo (01-03-2026). Opcional: vacía queda \"sin fecha registrada\"." },
] as const;

export type ClaveColumna = (typeof COLUMNAS)[number]["clave"];
/** Lo que se puede elegir al asignar una columna a mano: un dato de Convive o ignorarla. */
export type Destino = ClaveColumna | "ignorar";
/** Asignación de columnas: título normalizado de la planilla → dato de Convive. */
export type Mapeo = Record<string, Destino>;

/** "Alícuota (%)" → "alicuota": sin acentos, signos ni mayúsculas. */
export const normalizarTitulo = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

// Nombres de columna que se aceptan para cada dato (ya normalizados).
const SINONIMOS: Record<ClaveColumna, string[]> = {
  numero: ["unidad", "numero", "nro", "n", "depto", "departamento", "numerounidad", "unidadnumero"],
  tipo: ["tipo", "tipounidad", "tipodeunidad"],
  alicuota: ["alicuota", "alicuotas", "prorrateo", "participacion", "porcentaje", "coeficiente"],
  nombre: ["nombre", "nombres", "nombrecompleto", "propietario", "residente", "persona"],
  documento: ["rut", "documento", "dni", "cedula", "run", "rutodocumento"],
  correo: ["correo", "email", "mail", "correoelectronico"],
  telefono: ["telefono", "celular", "fono", "movil", "whatsapp"],
  relacion: ["relacion", "rol", "calidad", "vinculo", "tipovinculo", "tipodevinculo"],
  desde: ["desde", "fechainicio", "fechadeinicio", "inicio", "fechaingreso", "fechadeingreso", "vigentedesde"],
};

export function columnaDe(titulo: string): ClaveColumna | undefined {
  const t = normalizarTitulo(titulo);
  if (!t) return undefined;
  for (const [clave, nombres] of Object.entries(SINONIMOS) as [ClaveColumna, string[]][]) {
    if (nombres.includes(t)) return clave;
  }
  // "Alícuota %" o "Correo del propietario": basta con que empiece igual.
  for (const [clave, nombres] of Object.entries(SINONIMOS) as [ClaveColumna, string[]][]) {
    if (nombres.some((n) => n.length >= 4 && t.startsWith(n))) return clave;
  }
  return undefined;
}

const TIPOS: Record<string, Tipo> = {
  departamento: "DEPARTAMENTO",
  depto: "DEPARTAMENTO",
  dpto: "DEPARTAMENTO",
  casa: "CASA",
  oficina: "OFICINA",
  local: "LOCAL",
  localcomercial: "LOCAL",
  estacionamiento: "ESTACIONAMIENTO",
  estac: "ESTACIONAMIENTO",
  bodega: "BODEGA",
};

const PALABRAS_VINCULO: [RegExp, Relacion][] = [
  [/^(co|cop)$|copropietari|codueno|coduena/, "COPROPIETARIO"],
  [/^p$|propietari|dueno|duena/, "PROPIETARIO"],
  [/arrendatari|inquilin|arriendo/, "ARRENDATARIO"],
  [/^r$|residente/, "RESIDENTE"],
  [/ocupante/, "OCUPANTE"],
];

/** "Propietario y residente", "Ambos", "Arrendatario"… → vínculos; null si algo no se entiende. */
export function leerRelacion(valor: string): Relacion[] | null {
  if (!normalizarTitulo(valor)) return ["PROPIETARIO"];
  if (normalizarTitulo(valor) === "ambos") return ["PROPIETARIO", "RESIDENTE"];
  const partes = valor.split(/\s+y\s+|[,/+;]|\s+e\s+/i).map(normalizarTitulo).filter(Boolean);
  const tipos = new Set<Relacion>();
  for (const parte of partes) {
    const t = PALABRAS_VINCULO.find(([re]) => re.test(parte));
    if (!t) return null;
    tipos.add(t[1]);
  }
  return [...tipos];
}

/**
 * Fecha de una celda: fecha de Excel, "01-03-2026", "1/3/2026" o "2026-03-01" → "2026-03-01".
 * null si no se entiende.
 */
export function leerFecha(valor: unknown): string | null {
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor.toISOString().slice(0, 10);
  const s = String(valor ?? "").trim();
  let a: number, m: number, d: number;
  let r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (r) [a, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else if ((r = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) [d, m, a] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else return null;
  const f = new Date(Date.UTC(a, m - 1, d));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d || a < 1900) return null;
  return f.toISOString().slice(0, 10);
}

/** Letra de la columna de Excel: 0 → A, 27 → AB. */
export const letraColumna = (i: number): string => (i < 26 ? "" : letraColumna(Math.floor(i / 26) - 1)) + String.fromCharCode(65 + (i % 26));

/** "1,25", "1.25", "1,25 %" o un número de la planilla → número; null si no se entiende. */
export function leerNumero(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  const s = String(valor ?? "").replace(/[%\s]/g, "");
  if (!s) return null;
  // Con coma: la coma es decimal y los puntos, miles.
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : null;
}

/** RUT sin puntos, espacios ni guion y con la K en mayúscula, para comparar. */
export const normalizarDocumento = normalizarRut;

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const texto = (v: unknown) => {
  if (v === null || v === undefined) return undefined;
  const s = (v instanceof Date ? v.toISOString().slice(0, 10) : String(v)).trim();
  return s === "" ? undefined : s;
};

/** Una columna de la planilla y el dato de Convive al que corresponde. */
export type ColumnaLeida = { indice: number; letra: string; titulo: string; clave?: ClaveColumna; ejemplos: string[] };

export type Lectura = {
  filas: FilaImportada[];
  errores: ErrorFila[];
  avisos: string[];
  sinTitulos?: boolean;
  /** Columnas de la fila de títulos, para mostrarlas o asignarlas a mano. */
  columnas?: ColumnaLeida[];
};

export type OpcionesLectura = {
  /** Asignación hecha a mano o guardada en un perfil: manda sobre el reconocimiento automático. */
  mapeo?: Mapeo;
  /** Nombre de la hoja, para los mensajes. */
  hoja?: string;
  /** Hoy, para no aceptar vínculos que empiezan en el futuro. */
  hoy?: string;
};

/** Qué dato es cada título, primero según la asignación a mano y después por su nombre. */
const claveDe = (titulo: string, mapeo?: Mapeo): ClaveColumna | undefined => {
  const n = normalizarTitulo(titulo);
  if (mapeo && n in mapeo) return mapeo[n] === "ignorar" ? undefined : (mapeo[n] as ClaveColumna);
  return columnaDe(titulo);
};

/** La fila de títulos: la primera que tenga la columna de la unidad. */
export function filaDeTitulos(hoja: unknown[][], mapeo?: Mapeo) {
  return hoja.findIndex((fila) => fila.some((c) => claveDe(String(c ?? ""), mapeo) === "numero"));
}

/**
 * La fila que parece de títulos cuando no se reconoce ninguno: entre las primeras 20, la que tiene
 * más celdas escritas (así se salta un título como "Listado de copropietarios"). -1 si está vacía.
 */
export function filaProbableDeTitulos(hoja: unknown[][]) {
  let mejor = -1;
  let maximo = 0;
  hoja.slice(0, 20).forEach((f, i) => {
    const n = f.filter((c) => texto(c) !== undefined).length;
    if (n > maximo) [mejor, maximo] = [i, n];
  });
  return mejor;
}

/** Columnas de una fila de títulos con hasta 3 valores de ejemplo. */
export function columnasDe(hoja: unknown[][], iTitulos: number, mapeo?: Mapeo): ColumnaLeida[] {
  const titulos = hoja[iTitulos] ?? [];
  const usadas = new Set<ClaveColumna>();
  const columnas: ColumnaLeida[] = [];
  titulos.forEach((c, i) => {
    const titulo = texto(c);
    if (!titulo) return;
    let clave = claveDe(titulo, mapeo);
    if (clave && usadas.has(clave)) clave = undefined; // dos columnas para el mismo dato: vale la primera
    if (clave) usadas.add(clave);
    const ejemplos = hoja
      .slice(iTitulos + 1)
      .map((f) => texto(f[i]))
      .filter((v): v is string => v !== undefined)
      .slice(0, 3);
    columnas.push({ indice: i, letra: letraColumna(i), titulo, clave, ejemplos });
  });
  return columnas;
}

/** Texto que Excel tomaría como fórmula si se vuelve a exportar: no se acepta en nombres. */
const PARECE_FORMULA = /^[=@]/;

/**
 * Lee las filas de la hoja (primera fila con "Unidad" = títulos). Devuelve las filas válidas
 * y los errores de cada fila, con hoja, fila y columna; una fila con error no se carga.
 */
export function leerPlanilla(hoja: unknown[][], opciones: OpcionesLectura = {}): Lectura {
  const { mapeo, hoy } = opciones;
  const enHoja = opciones.hoja;
  const errores: ErrorFila[] = [];
  const avisos: string[] = [];
  const iTitulos = filaDeTitulos(hoja, mapeo);
  if (iTitulos === -1) {
    const iPrimera = filaProbableDeTitulos(hoja);
    return {
      filas: [],
      errores: [
        {
          fila: 1,
          hoja: enHoja,
          mensaje: 'No encontré la columna de la unidad. Indica qué columna es cada dato o usa la planilla de Convive (columna "Unidad").',
        },
      ],
      avisos,
      sinTitulos: true,
      columnas: iPrimera === -1 ? [] : columnasDe(hoja, iPrimera, mapeo),
    };
  }
  const columnas = columnasDe(hoja, iTitulos, mapeo);
  const indices: Partial<Record<ClaveColumna, number>> = {};
  for (const c of columnas) if (c.clave) indices[c.clave] = c.indice;
  // Las que se marcaron "No usar" a propósito no se avisan.
  const sinUsar = columnas.filter((c) => !c.clave && mapeo?.[normalizarTitulo(c.titulo)] !== "ignorar").map((c) => `"${c.titulo}"`);
  if (sinUsar.length) avisos.push(`Estas columnas no se usan y se ignoraron: ${sinUsar.join(", ")}.`);
  const col = (clave: ClaveColumna) => {
    const c = columnas.find((x) => x.clave === clave);
    return c ? ` (columna ${c.letra}, "${c.titulo}")` : "";
  };

  const filas: FilaImportada[] = [];
  for (let i = iTitulos + 1; i < hoja.length; i++) {
    const celda = (clave: ClaveColumna) => (indices[clave] === undefined ? undefined : hoja[i][indices[clave]!]);
    const n = i + 1;
    const valores = Object.keys(indices).map((k) => texto(celda(k as ClaveColumna)));
    if (valores.every((v) => v === undefined)) continue; // fila vacía

    const numero = texto(celda("numero"));
    if (!numero) {
      errores.push({ fila: n, hoja: enHoja, mensaje: `Falta el número de la unidad${col("numero")}.` });
      continue;
    }
    const fila: FilaImportada = { fila: n, numero, relaciones: [] };
    const problemas: string[] = [];

    const tipo = texto(celda("tipo"));
    if (tipo) {
      fila.tipo = TIPOS[normalizarTitulo(tipo)];
      if (!fila.tipo) problemas.push(`no reconozco el tipo "${tipo}"${col("tipo")}`);
    }
    const alicuota = celda("alicuota");
    if (texto(alicuota) !== undefined) {
      const a = leerNumero(alicuota);
      if (a === null || a <= 0 || a > 100) problemas.push(`la alícuota "${texto(alicuota)}" debe ser un número mayor que 0 y hasta 100${col("alicuota")}`);
      else fila.alicuota = a;
    }
    fila.nombre = texto(celda("nombre"));
    fila.documento = texto(celda("documento"));
    fila.correo = texto(celda("correo"))?.toLowerCase();
    fila.telefono = texto(celda("telefono"));
    const relacion = texto(celda("relacion"));
    const desde = celda("desde");
    if (fila.nombre) {
      if (fila.nombre.length < 2) problemas.push(`el nombre es muy corto${col("nombre")}`);
      if (PARECE_FORMULA.test(fila.nombre)) problemas.push(`el nombre no puede empezar con "=" ni "@"${col("nombre")}`);
      if (fila.correo && !CORREO.test(fila.correo)) problemas.push(`el correo "${fila.correo}" no es válido${col("correo")}`);
      const rel = leerRelacion(relacion ?? "");
      if (!rel) problemas.push(`no reconozco la relación "${relacion}" (usa ${Object.values(TIPOS_VINCULO).map((t) => t.texto).join(", ")})${col("relacion")}`);
      else fila.relaciones = rel;
      if (texto(desde) !== undefined) {
        const f = leerFecha(desde);
        if (!f) problemas.push(`no entiendo la fecha "${texto(desde)}" (usa 01-03-2026)${col("desde")}`);
        else if (hoy && f > hoy) problemas.push(`la fecha ${texto(desde)} es futura${col("desde")}`);
        else fila.desde = f;
      }
    } else if (fila.documento || fila.correo || fila.telefono) {
      problemas.push("tiene datos de una persona pero falta su nombre");
    }
    if (problemas.length) {
      errores.push({ fila: n, hoja: enHoja, mensaje: `Unidad ${numero}: ${problemas.join("; ")}.` });
      continue;
    }
    filas.push(fila);
  }

  // Alícuotas escritas como fracción (0,0125 en vez de 1,25), típico de celdas con formato %.
  const conAlicuota = filas.filter((f) => f.alicuota !== undefined);
  const unicas = new Map(conAlicuota.map((f) => [f.numero, f.alicuota!]));
  const suma = [...unicas.values()].reduce((s, a) => s + a, 0);
  if (unicas.size >= 2 && [...unicas.values()].every((a) => a <= 1) && Math.abs(suma - 1) < 0.01) {
    for (const f of conAlicuota) f.alicuota = Math.round(f.alicuota! * 100 * 1e6) / 1e6;
    avisos.push("Las alícuotas venían como fracción (por ejemplo 0,0125); las convertí a porcentaje (1,25 %).");
  }
  return { filas, errores, avisos, columnas };
}

/**
 * Perfil guardado que corresponde a esta planilla: el que tenga todos sus títulos en la fila de
 * títulos. Si hay varios, el que asigna más columnas.
 */
export function perfilQueCalza<P extends { columnas: Mapeo }>(hoja: unknown[][], perfiles: P[]): P | null {
  const titulos = new Set(hoja.slice(0, 30).flatMap((f) => f.map((c) => normalizarTitulo(String(c ?? ""))).filter(Boolean)));
  const calzan = perfiles.filter((p) => {
    const claves = Object.keys(p.columnas);
    return claves.length > 0 && claves.every((k) => titulos.has(k)) && Object.values(p.columnas).includes("numero");
  });
  calzan.sort((a, b) => Object.keys(b.columnas).length - Object.keys(a.columnas).length);
  return calzan[0] ?? null;
}

/** Revisa una asignación hecha a mano: la unidad es obligatoria y cada dato va en una sola columna. */
export function revisarMapeo(mapeo: Mapeo): string | null {
  const usados = Object.values(mapeo).filter((d) => d !== "ignorar");
  if (!usados.includes("numero")) return "Indica qué columna tiene el número de la unidad.";
  const repetido = usados.find((d, i) => usados.indexOf(d) !== i);
  if (repetido) return `El dato "${COLUMNAS.find((c) => c.clave === repetido)!.titulo}" está asignado a dos columnas.`;
  return null;
}

/** Lee un CSV (separado por punto y coma, coma o tabulación, como lo guarda Excel). */
export function leerCsv(contenido: string): string[][] {
  const limpio = contenido.replace(/^﻿/, "");
  const primera = limpio.split(/\r?\n/, 1)[0] ?? "";
  const separador = [";", "\t", ","].reduce((mejor, s) =>
    primera.split(s).length > primera.split(mejor).length ? s : mejor,
  );
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let comillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (comillas) {
      if (c === '"' && limpio[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === separador) {
      fila.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && limpio[i + 1] === "\n") i++;
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = "";
    } else campo += c;
  }
  if (campo || fila.length) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas;
}

// ---------------------------------------------------------------------------
// Plan: qué se crea y qué se cambia, comparando con lo que ya está en la propiedad.

export type UnidadExistente = { id: string; numero: string; tipo: Tipo; alicuota: number };
export type PersonaExistente = {
  id: string;
  nombre: string;
  documento: string | null;
  correo: string | null;
  telefono: string | null;
};
/** Vínculo vigente de una persona con una unidad (VinculoUnidad sin fecha de término). */
export type VinculoExistente = { unidadId: string; personaId: string; relacion: Relacion };

export type UnidadPlan = {
  numero: string;
  tipo: Tipo;
  alicuota: number;
  accion: "crear" | "actualizar" | "igual";
  id?: string;
  antes?: { tipo: Tipo; alicuota: number };
};
export type PersonaPlan = {
  clave: string;
  nombre: string;
  documento?: string;
  correo?: string;
  telefono?: string;
  accion: "crear" | "completar" | "igual";
  id?: string;
  /** Datos que la persona ya registrada no tenía y se agregan. */
  completar?: { documento?: string; correo?: string; telefono?: string };
};
export type VinculoPlan = { numero: string; persona: string; relacion: Relacion; desde?: string; nuevo: boolean };

export type Plan = {
  unidades: UnidadPlan[];
  personas: PersonaPlan[];
  vinculos: VinculoPlan[];
  errores: ErrorFila[];
  /** Suma de alícuotas de la propiedad después de importar. */
  sumaAlicuotas: number;
  totalUnidades: number;
};

const iguales = (a: number, b: number) => Math.abs(a - b) < 1e-6;

export function planificar(
  filas: FilaImportada[],
  existentes: { unidades: UnidadExistente[]; personas: PersonaExistente[]; vinculos: VinculoExistente[] },
): Plan {
  const errores: ErrorFila[] = [];
  const porNumero = new Map(existentes.unidades.map((u) => [u.numero.toLowerCase(), u]));
  const unidades = new Map<string, UnidadPlan>();

  // Unidades: la primera fila de cada una manda; otra fila con datos distintos es un error.
  const filasValidas: FilaImportada[] = [];
  for (const f of filas) {
    const llave = f.numero!.toLowerCase();
    const ya = unidades.get(llave);
    if (ya) {
      if ((f.alicuota !== undefined && !iguales(f.alicuota, ya.alicuota)) || (f.tipo && f.tipo !== ya.tipo)) {
        errores.push({ fila: f.fila, mensaje: `Unidad ${f.numero}: aparece otra vez con distinto tipo o alícuota.` });
        continue;
      }
      filasValidas.push(f);
      continue;
    }
    const existe = porNumero.get(llave);
    if (!existe && f.alicuota === undefined) {
      errores.push({ fila: f.fila, mensaje: `Unidad ${f.numero}: es nueva y le falta la alícuota.` });
      continue;
    }
    const tipo = f.tipo ?? existe?.tipo ?? "DEPARTAMENTO";
    const alicuota = f.alicuota ?? existe!.alicuota;
    unidades.set(llave, {
      numero: existe?.numero ?? f.numero!,
      tipo,
      alicuota,
      id: existe?.id,
      accion: !existe ? "crear" : existe.tipo === tipo && iguales(existe.alicuota, alicuota) ? "igual" : "actualizar",
      antes: existe && { tipo: existe.tipo, alicuota: existe.alicuota },
    });
    filasValidas.push(f);
  }

  // Personas: se reconoce a la misma persona por RUT o, si no tiene, por correo.
  const personas = new Map<string, PersonaPlan>();
  const claveDe = new Map<string, string>(); // "rut:..." o "correo:..." → clave de persona del plan
  const existentePorDoc = new Map<string, PersonaExistente>();
  const existentePorCorreo = new Map<string, PersonaExistente>();
  for (const p of existentes.personas) {
    if (p.documento) existentePorDoc.set(normalizarDocumento(p.documento), p);
    if (p.correo) existentePorCorreo.set(p.correo.toLowerCase(), p);
  }
  const personaPorId = new Map(existentes.personas.map((p) => [p.id, p]));
  const existentePorNombreEnUnidad = new Map<string, PersonaExistente>();
  for (const v of existentes.vinculos) {
    const p = personaPorId.get(v.personaId);
    if (p) existentePorNombreEnUnidad.set(`${v.unidadId}|nombre:${normalizarTitulo(p.nombre)}`, p);
  }
  const vinculos: VinculoPlan[] = [];
  const vistos = new Set<string>();
  const yaVinculados = new Set(existentes.vinculos.map((v) => `${v.unidadId}|${v.personaId}|${v.relacion}`));

  for (const f of filasValidas) {
    if (!f.nombre) continue;
    const doc = f.documento ? `rut:${normalizarDocumento(f.documento)}` : undefined;
    const mail = f.correo ? `correo:${f.correo}` : undefined;
    // Sin RUT ni correo, solo queda el nombre: dos filas con el mismo nombre son la misma persona.
    const nombre = !doc && !mail ? `nombre:${normalizarTitulo(f.nombre)}` : undefined;
    const unidadFila = unidades.get(f.numero!.toLowerCase())!;
    let clave = (doc && claveDe.get(doc)) || (!doc && mail && claveDe.get(mail)) || (nombre && claveDe.get(nombre)) || undefined;
    if (!clave) {
      const existe =
        (f.documento && existentePorDoc.get(normalizarDocumento(f.documento))) ||
        (!f.documento && f.correo && existentePorCorreo.get(f.correo)) ||
        // Al volver a subir la planilla, alguien sin RUT ni correo se reconoce por su nombre en la misma unidad.
        (nombre && unidadFila.id && existentePorNombreEnUnidad.get(`${unidadFila.id}|${nombre}`)) ||
        undefined;
      clave = existe ? `id:${existe.id}` : `fila:${f.fila}`;
      if (!personas.has(clave)) {
        if (existe) {
          const completar = {
            documento: !existe.documento ? f.documento : undefined,
            correo: !existe.correo ? f.correo : undefined,
            telefono: !existe.telefono ? f.telefono : undefined,
          };
          const hay = Object.values(completar).some(Boolean);
          personas.set(clave, {
            clave,
            id: existe.id,
            nombre: existe.nombre,
            documento: existe.documento ?? f.documento,
            correo: existe.correo ?? f.correo,
            telefono: existe.telefono ?? f.telefono,
            accion: hay ? "completar" : "igual",
            completar: hay ? completar : undefined,
          });
        } else {
          personas.set(clave, {
            clave,
            nombre: f.nombre,
            documento: f.documento,
            correo: f.correo,
            telefono: f.telefono,
            accion: "crear",
          });
        }
      }
      if (doc) claveDe.set(doc, clave);
      if (mail && !claveDe.has(mail)) claveDe.set(mail, clave);
      if (nombre) claveDe.set(nombre, clave);
    }
    const persona = personas.get(clave)!;
    const unidad = unidadFila;
    for (const relacion of f.relaciones) {
      const llave = `${unidad.numero}|${clave}|${relacion}`;
      if (vistos.has(llave)) continue;
      const nuevo = !(unidad.id && persona.id && yaVinculados.has(`${unidad.id}|${persona.id}|${relacion}`));
      if (nuevo) {
        // Las mismas reglas que al vincular a mano (Entrega 3), contra lo que ya hay y lo que viene antes en la planilla.
        const enUnidad = [
          ...existentes.vinculos
            .filter((v) => v.unidadId === unidad.id)
            .map((v) => ({ personaId: `id:${v.personaId}`, nombre: personaPorId.get(v.personaId)?.nombre ?? "Otra persona", tipo: v.relacion, hasta: null })),
          ...vinculos
            .filter((v) => v.numero === unidad.numero)
            .map((v) => ({ personaId: v.persona, nombre: personas.get(v.persona)!.nombre, tipo: v.relacion, hasta: null })),
        ];
        const error = revisarVinculo(
          { personaId: clave, tipo: relacion, desde: new Date(0), terminoPrevisto: null },
          enUnidad,
          new Date(8.64e15),
        );
        if (error) {
          errores.push({ fila: f.fila, mensaje: `Unidad ${unidad.numero}, ${persona.nombre}: ${error}` });
          continue;
        }
      }
      vistos.add(llave);
      vinculos.push({ numero: unidad.numero, persona: clave, relacion, desde: f.desde, nuevo });
    }
  }

  // Suma final de alícuotas: las que no vienen en la planilla quedan como están.
  const finales = new Map(existentes.unidades.map((u) => [u.numero.toLowerCase(), u.alicuota]));
  for (const [llave, u] of unidades) finales.set(llave, u.alicuota);
  const sumaAlicuotas = Math.round([...finales.values()].reduce((s, a) => s + a, 0) * 1e6) / 1e6;

  return {
    unidades: [...unidades.values()],
    personas: [...personas.values()],
    vinculos,
    errores,
    sumaAlicuotas,
    totalUnidades: finales.size,
  };
}

/** Cuántas cosas cambia el plan, para el resumen y el registro de cambios. */
export function resumenPlan(plan: Plan) {
  return {
    unidadesNuevas: plan.unidades.filter((u) => u.accion === "crear").length,
    unidadesActualizadas: plan.unidades.filter((u) => u.accion === "actualizar").length,
    personasNuevas: plan.personas.filter((p) => p.accion === "crear").length,
    personasCompletadas: plan.personas.filter((p) => p.accion === "completar").length,
    vinculosNuevos: plan.vinculos.filter((v) => v.nuevo).length,
  };
}

export const hayCambios = (plan: Plan) => Object.values(resumenPlan(plan)).some((n) => n > 0);
