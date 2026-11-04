// Carga masiva de unidades y personas desde una planilla (Excel o CSV).
// Todo lo de este archivo es puro (sin base de datos) para poder probarlo:
// 1) leerPlanilla convierte las filas de la hoja en FilaImportada,
// 2) planificar compara con lo que ya existe y dice qué se va a crear o cambiar.

export type Tipo = "DEPARTAMENTO" | "CASA" | "OFICINA" | "LOCAL" | "ESTACIONAMIENTO" | "BODEGA";
export type Relacion = "PROPIETARIO" | "RESIDENTE";

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
};

export type ErrorFila = { fila: number; mensaje: string };

export const COLUMNAS = [
  { clave: "numero", titulo: "Unidad", ayuda: "Número o nombre de la unidad (101, Casa 4, B-12). Obligatorio." },
  { clave: "tipo", titulo: "Tipo", ayuda: "Departamento, Casa, Oficina, Local, Estacionamiento o Bodega. Vacío = Departamento." },
  { clave: "alicuota", titulo: "Alícuota (%)", ayuda: "Porcentaje de participación (1,25 = 1,25 %). Obligatoria para unidades nuevas." },
  { clave: "nombre", titulo: "Nombre", ayuda: "Nombre completo del propietario o residente. Vacío = solo se carga la unidad." },
  { clave: "documento", titulo: "RUT", ayuda: "RUT o documento. Sirve para reconocer a la misma persona en varias unidades." },
  { clave: "correo", titulo: "Correo", ayuda: "Necesario para invitarlo a la app." },
  { clave: "telefono", titulo: "Teléfono", ayuda: "Celular, para mandarle la invitación por WhatsApp." },
  { clave: "relacion", titulo: "Relación", ayuda: "Propietario, Residente o Ambos. Vacío = Propietario." },
] as const;

type ClaveColumna = (typeof COLUMNAS)[number]["clave"];

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
  relacion: ["relacion", "rol", "calidad", "vinculo"],
};

function columnaDe(titulo: string): ClaveColumna | undefined {
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

function leerRelacion(valor: string): Relacion[] | null {
  const t = normalizarTitulo(valor);
  if (!t) return ["PROPIETARIO"];
  const propietario = /propietari|dueno|duena/.test(t) || t === "p";
  const residente = /residente|arrendatari|ocupante|inquilin/.test(t) || t === "r";
  if (t === "ambos" || (propietario && residente)) return ["PROPIETARIO", "RESIDENTE"];
  if (propietario) return ["PROPIETARIO"];
  if (residente) return ["RESIDENTE"];
  return null;
}

/** "1,25", "1.25", "1,25 %" o un número de la planilla → número; null si no se entiende. */
export function leerNumero(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  const s = String(valor ?? "").replace(/[%\s]/g, "");
  if (!s) return null;
  // Con coma: la coma es decimal y los puntos, miles.
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : null;
}

/** RUT sin puntos ni espacios y con la K en mayúscula, para comparar. */
export const normalizarDocumento = (s: string) => s.replace(/[.\s]/g, "").toUpperCase();

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const texto = (v: unknown) => {
  if (v === null || v === undefined) return undefined;
  const s = (v instanceof Date ? v.toISOString().slice(0, 10) : String(v)).trim();
  return s === "" ? undefined : s;
};

export type Lectura = { filas: FilaImportada[]; errores: ErrorFila[]; avisos: string[]; sinTitulos?: boolean };

/**
 * Lee las filas de la hoja (primera fila con "Unidad" = títulos). Devuelve las filas válidas
 * y los errores de cada fila; una fila con error no se carga.
 */
export function leerPlanilla(hoja: unknown[][]): Lectura {
  const errores: ErrorFila[] = [];
  const avisos: string[] = [];
  const iTitulos = hoja.findIndex((fila) => fila.some((c) => columnaDe(String(c ?? "")) === "numero"));
  if (iTitulos === -1) {
    return {
      filas: [],
      errores: [{ fila: 1, mensaje: 'No encontré la fila de títulos. La planilla debe tener una columna llamada "Unidad".' }],
      avisos,
      sinTitulos: true,
    };
  }
  const indices: Partial<Record<ClaveColumna, number>> = {};
  hoja[iTitulos].forEach((c, i) => {
    const clave = columnaDe(String(c ?? ""));
    if (clave && indices[clave] === undefined) indices[clave] = i;
  });
  const sinUsar = hoja[iTitulos]
    .filter((c, i) => texto(c) && !Object.values(indices).includes(i))
    .map((c) => `"${texto(c)}"`);
  if (sinUsar.length) avisos.push(`Estas columnas no se usan y se ignoraron: ${sinUsar.join(", ")}.`);

  const filas: FilaImportada[] = [];
  for (let i = iTitulos + 1; i < hoja.length; i++) {
    const celda = (clave: ClaveColumna) => (indices[clave] === undefined ? undefined : hoja[i][indices[clave]!]);
    const n = i + 1;
    const valores = Object.keys(indices).map((k) => texto(celda(k as ClaveColumna)));
    if (valores.every((v) => v === undefined)) continue; // fila vacía

    const numero = texto(celda("numero"));
    if (!numero) {
      errores.push({ fila: n, mensaje: "Falta el número de la unidad." });
      continue;
    }
    const fila: FilaImportada = { fila: n, numero, relaciones: [] };
    const problemas: string[] = [];

    const tipo = texto(celda("tipo"));
    if (tipo) {
      fila.tipo = TIPOS[normalizarTitulo(tipo)];
      if (!fila.tipo) problemas.push(`no reconozco el tipo "${tipo}"`);
    }
    const alicuota = celda("alicuota");
    if (texto(alicuota) !== undefined) {
      const a = leerNumero(alicuota);
      if (a === null || a <= 0 || a > 100) problemas.push(`la alícuota "${texto(alicuota)}" debe ser un número mayor que 0 y hasta 100`);
      else fila.alicuota = a;
    }
    fila.nombre = texto(celda("nombre"));
    fila.documento = texto(celda("documento"));
    fila.correo = texto(celda("correo"))?.toLowerCase();
    fila.telefono = texto(celda("telefono"));
    const relacion = texto(celda("relacion"));
    if (fila.nombre) {
      if (fila.nombre.length < 2) problemas.push("el nombre es muy corto");
      if (fila.correo && !CORREO.test(fila.correo)) problemas.push(`el correo "${fila.correo}" no es válido`);
      const rel = leerRelacion(relacion ?? "");
      if (!rel) problemas.push(`no reconozco la relación "${relacion}" (usa Propietario, Residente o Ambos)`);
      else fila.relaciones = rel;
    } else if (fila.documento || fila.correo || fila.telefono) {
      problemas.push("tiene datos de una persona pero falta su nombre");
    }
    if (problemas.length) {
      errores.push({ fila: n, mensaje: `Unidad ${numero}: ${problemas.join("; ")}.` });
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
  return { filas, errores, avisos };
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
export type VinculoPlan = { numero: string; persona: string; relacion: Relacion; nuevo: boolean };

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
      vistos.add(llave);
      const nuevo = !(unidad.id && persona.id && yaVinculados.has(`${unidad.id}|${persona.id}|${relacion}`));
      vinculos.push({ numero: unidad.numero, persona: clave, relacion, nuevo });
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
