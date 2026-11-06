// COM-001-VIS · Generador visual de comunidades.
// Funciones puras (sin base de datos) para poder probarlas: respuestas del asistente,
// numeración automática, plan de lo que se va a crear, comparación con lo que ya existe
// y distribución inicial del plano. El generador NO tiene tablas propias de unidades:
// todo lo que crea son Agrupacion, Unidad, Espacio e Instalacion (las mismas de COM-001).

import type { TipoAgrupacion, TipoInstalacion, Destino } from "./estructura";

export type TipoGenerador = "CASAS" | "EDIFICIOS" | "MIXTA";
export type ModoEspacios = "TODOS" | "ALGUNOS" | "NINGUNO" | "DESPUES";

export type Torre = {
  nombre: string;
  prefijo: string;
  pisos: number;
  deptosPorPiso: number;
  subterraneos: number;
  /** Pisos con distinta cantidad de departamentos (0 = piso sin departamentos). */
  excepciones: { piso: number; unidades: number }[];
};

export type NumeracionEdificios = {
  /** PISO: 101, 102… 201 · CORRELATIVO: 1, 2, 3… */
  esquema: "PISO" | "CORRELATIVO";
  prefijoTorre: boolean;
  separador: string;
  /** Solo para correlativo: cada torre parte de nuevo o sigue la cuenta. */
  serie: "POR_TORRE" | "GLOBAL";
  /** Ceros iniciales del correlativo (3 → 001). */
  digitos: number;
  /** Número inicial: en PISO es el primer departamento del piso (1 → 101); en correlativo, el primero. */
  inicio: number;
  /** Números que no se usan, separados por coma (por ejemplo 13, 113). */
  omitir: string;
};

export type Edificios = {
  cantidad: number;
  iguales: boolean;
  modelo: { pisos: number; deptosPorPiso: number; subterraneos: number };
  torres: Torre[];
  numeracion: NumeracionEdificios;
};

export type SectorCasas = { nombre: string; prefijo: string; casas: number };

export type NumeracionCasas = {
  /** CORRELATIVO: 1, 2, 3 en toda la comunidad · POR_SECTOR: A-01, A-02, B-01. */
  esquema: "CORRELATIVO" | "POR_SECTOR";
  /** Texto antes del número, por ejemplo "Casa " (opcional). */
  prefijo: string;
  separador: string;
  digitos: number;
  inicio: number;
  omitir: string;
};

export type Casas = {
  cantidad: number;
  conSectores: boolean;
  sectores: SectorCasas[];
  numeracion: NumeracionCasas;
};

export type RespEspacios = {
  modo: ModoEspacios;
  /** Para "Algunos": cuántos hay. */
  cantidad: number;
  /** Para "Todos": proponer (por confirmar) un vínculo con cada unidad. */
  proponerVinculo: boolean;
  prefijo: string;
  digitos: number;
  inicio: number;
};

export type Extras = { visitas: number; accesibles: number; comunes: number; servicio: number; bodegasComunes: number };

export type ClaveInstalacion =
  | "PISCINA"
  | "QUINCHO"
  | "SALON"
  | "GIMNASIO"
  | "JUEGOS"
  | "AREA_VERDE"
  | "CANCHA"
  | "CONSERJERIA"
  | "BICICLETERO"
  | "BOMBAS"
  | "ELECTRICA"
  | "INCENDIO"
  | "OTRO";

export type Respuestas = {
  version: 1;
  tipo: TipoGenerador | null;
  /** Paso del asistente en que quedó (para continuar después). */
  paso: number;
  casas: Casas;
  edificios: Edificios;
  accesos: number;
  estacionamientos: RespEspacios;
  bodegas: RespEspacios;
  extras: Extras;
  instalaciones: Partial<Record<ClaveInstalacion, { cantidad: number; ubicacion: string }>>;
  /** Número o nombre corregido a mano, por clave interna del elemento. */
  renombres: Record<string, string>;
};

export const TIPOS_GENERADOR: Record<TipoGenerador, { texto: string; ayuda: string; tipoComunidad: "CONDOMINIO_CASAS" | "EDIFICIO" | "MIXTO" }> = {
  CASAS: { texto: "Casas", ayuda: "Condominio de casas, con o sin sectores o etapas.", tipoComunidad: "CONDOMINIO_CASAS" },
  EDIFICIOS: { texto: "Edificios o departamentos", ayuda: "Una o varias torres con pisos y departamentos.", tipoComunidad: "EDIFICIO" },
  MIXTA: { texto: "Mixta: casas y edificios", ayuda: "Sectores de casas y torres en la misma comunidad.", tipoComunidad: "MIXTO" },
};

export const MODOS_ESPACIOS: Record<ModoEspacios, string> = {
  TODOS: "Todos",
  ALGUNOS: "Algunos",
  NINGUNO: "Ninguno",
  DESPUES: "Lo definiré después",
};

export const CATALOGO_INSTALACIONES: Record<ClaveInstalacion, { texto: string; tipo: TipoInstalacion; prefijo: string }> = {
  PISCINA: { texto: "Piscina", tipo: "ESPACIO_COMUN", prefijo: "PIS" },
  QUINCHO: { texto: "Quincho", tipo: "ESPACIO_COMUN", prefijo: "QUI" },
  SALON: { texto: "Salón multiuso", tipo: "ESPACIO_COMUN", prefijo: "SAL" },
  GIMNASIO: { texto: "Gimnasio", tipo: "ESPACIO_COMUN", prefijo: "GIM" },
  JUEGOS: { texto: "Juegos infantiles", tipo: "EQUIPAMIENTO", prefijo: "JUE" },
  AREA_VERDE: { texto: "Área verde", tipo: "ESPACIO_COMUN", prefijo: "AV" },
  CANCHA: { texto: "Cancha", tipo: "ESPACIO_COMUN", prefijo: "CAN" },
  CONSERJERIA: { texto: "Conserjería", tipo: "EQUIPAMIENTO", prefijo: "CONS" },
  BICICLETERO: { texto: "Bicicletero", tipo: "EQUIPAMIENTO", prefijo: "BIC" },
  BOMBAS: { texto: "Sala de bombas", tipo: "BOMBA", prefijo: "BOM" },
  ELECTRICA: { texto: "Sala eléctrica", tipo: "ELECTRICO", prefijo: "ELE" },
  INCENDIO: { texto: "Red contra incendios", tipo: "CONTRA_INCENDIOS", prefijo: "INC" },
  OTRO: { texto: "Otro espacio", tipo: "OTRO", prefijo: "OTR" },
};

export const LIMITES = { torres: 30, pisos: 60, deptosPorPiso: 40, subterraneos: 6, casas: 2000, sectores: 26, unidades: 3000, espacios: 3000, accesos: 10, instalacion: 20 };

// ── Valores por defecto y normalización ────────────────────────────────────

const LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const letra = (i: number) => (i < 26 ? LETRAS[i] : `${LETRAS[Math.floor(i / 26) - 1]}${LETRAS[i % 26]}`);

const entero = (v: unknown, min: number, max: number, def: number) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : def;
};
const texto = (v: unknown, max: number, def = "") => (typeof v === "string" ? v.slice(0, max) : def);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export function torreInicial(i: number, modelo: Edificios["modelo"]): Torre {
  return { nombre: letra(i), prefijo: letra(i), ...modelo, excepciones: [] };
}

export function sectorInicial(i: number): SectorCasas {
  return { nombre: letra(i), prefijo: letra(i), casas: 0 };
}

export function respuestasIniciales(tipo: TipoGenerador | null = null): Respuestas {
  const modelo = { pisos: 5, deptosPorPiso: 4, subterraneos: 0 };
  return {
    version: 1,
    tipo,
    paso: 0,
    casas: {
      cantidad: 20,
      conSectores: false,
      sectores: [{ ...sectorInicial(0), casas: 20 }],
      numeracion: { esquema: "CORRELATIVO", prefijo: "", separador: "-", digitos: 0, inicio: 1, omitir: "" },
    },
    edificios: {
      cantidad: 1,
      iguales: true,
      modelo,
      torres: [torreInicial(0, modelo)],
      numeracion: { esquema: "PISO", prefijoTorre: false, separador: "-", serie: "POR_TORRE", digitos: 0, inicio: 1, omitir: "" },
    },
    accesos: 1,
    estacionamientos: { modo: "DESPUES", cantidad: 0, proponerVinculo: true, prefijo: "E-", digitos: 3, inicio: 1 },
    bodegas: { modo: "DESPUES", cantidad: 0, proponerVinculo: true, prefijo: "B-", digitos: 3, inicio: 1 },
    extras: { visitas: 0, accesibles: 0, comunes: 0, servicio: 0, bodegasComunes: 0 },
    instalaciones: {},
    renombres: {},
  };
}

function normalizarEspacios(v: unknown, def: RespEspacios): RespEspacios {
  const o = obj(v);
  const modo = Object.keys(MODOS_ESPACIOS).includes(o.modo as string) ? (o.modo as ModoEspacios) : def.modo;
  return {
    modo,
    cantidad: entero(o.cantidad, 0, LIMITES.espacios, def.cantidad),
    proponerVinculo: typeof o.proponerVinculo === "boolean" ? o.proponerVinculo : def.proponerVinculo,
    prefijo: texto(o.prefijo, 8, def.prefijo),
    digitos: entero(o.digitos, 0, 5, def.digitos),
    inicio: entero(o.inicio, 0, 99999, def.inicio),
  };
}

/** Deja las respuestas en un formato seguro (lo que llega del navegador o de la base no se cree a ciegas). */
export function normalizar(v: unknown): Respuestas {
  const d = respuestasIniciales();
  const o = obj(v);
  const tipo = Object.keys(TIPOS_GENERADOR).includes(o.tipo as string) ? (o.tipo as TipoGenerador) : null;

  const c = obj(o.casas);
  const nc = obj(c.numeracion);
  const sectores = lista(c.sectores)
    .slice(0, LIMITES.sectores)
    .map((s, i) => {
      const so = obj(s);
      return { nombre: texto(so.nombre, 40, letra(i)), prefijo: texto(so.prefijo, 8, letra(i)), casas: entero(so.casas, 0, LIMITES.casas, 0) };
    });
  const casas: Casas = {
    cantidad: entero(c.cantidad, 0, LIMITES.casas, d.casas.cantidad),
    conSectores: c.conSectores === true,
    sectores: sectores.length ? sectores : d.casas.sectores,
    numeracion: {
      esquema: nc.esquema === "POR_SECTOR" ? "POR_SECTOR" : "CORRELATIVO",
      prefijo: texto(nc.prefijo, 12),
      separador: texto(nc.separador, 2, "-"),
      digitos: entero(nc.digitos, 0, 5, 0),
      inicio: entero(nc.inicio, 0, 99999, 1),
      omitir: texto(nc.omitir, 500),
    },
  };

  const e = obj(o.edificios);
  const m = obj(e.modelo);
  const modelo = {
    pisos: entero(m.pisos, 1, LIMITES.pisos, 5),
    deptosPorPiso: entero(m.deptosPorPiso, 1, LIMITES.deptosPorPiso, 4),
    subterraneos: entero(m.subterraneos, 0, LIMITES.subterraneos, 0),
  };
  const ne = obj(e.numeracion);
  const torres = lista(e.torres)
    .slice(0, LIMITES.torres)
    .map((t, i) => {
      const to = obj(t);
      return {
        nombre: texto(to.nombre, 40, letra(i)),
        prefijo: texto(to.prefijo, 8, letra(i)),
        pisos: entero(to.pisos, 1, LIMITES.pisos, modelo.pisos),
        deptosPorPiso: entero(to.deptosPorPiso, 1, LIMITES.deptosPorPiso, modelo.deptosPorPiso),
        subterraneos: entero(to.subterraneos, 0, LIMITES.subterraneos, modelo.subterraneos),
        excepciones: lista(to.excepciones)
          .slice(0, LIMITES.pisos)
          .map((x) => ({ piso: entero(obj(x).piso, 1, LIMITES.pisos, 1), unidades: entero(obj(x).unidades, 0, LIMITES.deptosPorPiso, 0) })),
      };
    });
  const edificios: Edificios = {
    cantidad: entero(e.cantidad, 1, LIMITES.torres, 1),
    iguales: e.iguales !== false,
    modelo,
    torres: torres.length ? torres : [torreInicial(0, modelo)],
    numeracion: {
      esquema: ne.esquema === "CORRELATIVO" ? "CORRELATIVO" : "PISO",
      prefijoTorre: ne.prefijoTorre === true,
      separador: texto(ne.separador, 2, "-"),
      serie: ne.serie === "GLOBAL" ? "GLOBAL" : "POR_TORRE",
      digitos: entero(ne.digitos, 0, 5, 0),
      inicio: entero(ne.inicio, 0, 99999, 1),
      omitir: texto(ne.omitir, 500),
    },
  };

  const x = obj(o.extras);
  const instalaciones: Respuestas["instalaciones"] = {};
  for (const [k, val] of Object.entries(obj(o.instalaciones))) {
    if (!(k in CATALOGO_INSTALACIONES)) continue;
    const vo = obj(val);
    const cantidad = entero(vo.cantidad, 0, LIMITES.instalacion, 0);
    if (cantidad > 0) instalaciones[k as ClaveInstalacion] = { cantidad, ubicacion: texto(vo.ubicacion, 120) };
  }
  const renombres: Record<string, string> = {};
  for (const [k, val] of Object.entries(obj(o.renombres)).slice(0, 5000)) {
    const t = texto(val, 40).trim();
    if (t && k.length <= 40) renombres[k] = t;
  }

  return ajustar({
    version: 1,
    tipo,
    paso: entero(o.paso, 0, 10, 0),
    casas,
    edificios,
    accesos: entero(o.accesos, 0, LIMITES.accesos, 1),
    estacionamientos: normalizarEspacios(o.estacionamientos, d.estacionamientos),
    bodegas: normalizarEspacios(o.bodegas, d.bodegas),
    extras: {
      visitas: entero(x.visitas, 0, 500, 0),
      accesibles: entero(x.accesibles, 0, 500, 0),
      comunes: entero(x.comunes, 0, 500, 0),
      servicio: entero(x.servicio, 0, 500, 0),
      bodegasComunes: entero(x.bodegasComunes, 0, 500, 0),
    },
    instalaciones,
    renombres,
  });
}

/** Reparte un total en n partes casi iguales (las primeras reciben una más). */
export function repartir(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => base + (i < total % n ? 1 : 0));
}

/**
 * Mantiene coherentes las respuestas: tantas torres como se indicó (copiando la torre modelo si
 * todas son iguales) y la cantidad de casas igual a la suma de los sectores.
 */
export function ajustar(r: Respuestas): Respuestas {
  const e = r.edificios;
  const torres = Array.from({ length: e.cantidad }, (_, i) => {
    const t = e.torres[i] ?? torreInicial(i, e.modelo);
    return e.iguales ? { ...t, pisos: e.modelo.pisos, deptosPorPiso: e.modelo.deptosPorPiso, subterraneos: e.modelo.subterraneos } : t;
  }).map((t) => ({ ...t, excepciones: t.excepciones.filter((x) => x.piso <= t.pisos) }));

  const c = r.casas;
  let sectores = c.sectores;
  if (!c.conSectores) sectores = [{ ...(c.sectores[0] ?? sectorInicial(0)), casas: c.cantidad }];
  const cantidad = c.conSectores ? sectores.reduce((s, x) => s + x.casas, 0) : c.cantidad;
  return { ...r, edificios: { ...e, torres }, casas: { ...c, sectores, cantidad } };
}

/** Cambia la cantidad de sectores y reparte las casas entre ellos. */
export function cambiarSectores(c: Casas, n: number): Casas {
  const total = c.cantidad;
  const partes = repartir(total, n);
  return { ...c, sectores: partes.map((casas, i) => ({ ...(c.sectores[i] ?? sectorInicial(i)), casas })) };
}

// ── Numeración ─────────────────────────────────────────────────────────────

export const conCeros = (n: number, digitos: number) => String(n).padStart(digitos, "0");

/** "13, 113 ,A-13" → conjunto de números a omitir. */
export function listaOmitir(t: string): Set<string> {
  return new Set(
    t
      .split(/[,;\n]/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
  );
}

// ── Plan: lo que el asistente propone crear ────────────────────────────────

export type AgrupacionPlan = { clave: string; tipo: TipoAgrupacion; nombre: string; padre?: string; orden: number };
export type UnidadPlan = {
  clave: string;
  numero: string;
  /** Número calculado por la regla, antes de correcciones a mano. */
  automatico: string;
  tipo: "CASA" | "DEPARTAMENTO";
  agrupacion?: string;
  /** Torre o sector (para dibujar). */
  grupo: string;
  piso?: number;
};
export type EspacioPlan = {
  clave: string;
  clase: "ESTACIONAMIENTO" | "BODEGA";
  codigo: string;
  destino: Destino | null;
  accesible: boolean;
  /** Propuesta por confirmar (no es una asignación). */
  nota?: string;
  grupo: "PRIVADOS" | "VISITAS" | "OTROS";
};
export type InstalacionPlan = { clave: string; tipo: TipoInstalacion; codigo: string; nombre: string; ubicacion?: string; acceso: boolean };
export type Plan = {
  agrupaciones: AgrupacionPlan[];
  unidades: UnidadPlan[];
  espacios: EspacioPlan[];
  instalaciones: InstalacionPlan[];
  /** Torres y sectores para dibujar, en orden. */
  bloques: { clave: string; clase: "TORRE" | "SECTOR"; nombre: string; pisos?: number; subterraneos?: number; registro: boolean }[];
};

const tieneCasas = (r: Respuestas) => r.tipo === "CASAS" || r.tipo === "MIXTA";
const tieneEdificios = (r: Respuestas) => r.tipo === "EDIFICIOS" || r.tipo === "MIXTA";

/** Departamentos de cada piso de una torre (con excepciones). */
export function deptosDelPiso(t: Torre, piso: number) {
  return t.excepciones.find((x) => x.piso === piso)?.unidades ?? t.deptosPorPiso;
}

export function planificar(r: Respuestas): Plan {
  const plan: Plan = { agrupaciones: [], unidades: [], espacios: [], instalaciones: [], bloques: [] };
  const ren = (clave: string, auto: string) => r.renombres[clave] ?? auto;

  if (tieneCasas(r)) {
    const c = r.casas;
    const n = c.numeracion;
    const omitir = listaOmitir(n.omitir);
    // En una comunidad mixta las casas van siempre en un sector, para distinguirlas de las torres.
    const conRegistro = c.conSectores || r.tipo === "MIXTA";
    let global = n.inicio;
    c.sectores.forEach((s, si) => {
      const clave = `S${si + 1}`;
      const nombre = ren(clave, c.conSectores ? s.nombre : "Casas");
      if (conRegistro) plan.agrupaciones.push({ clave, tipo: "SECTOR", nombre, orden: si });
      plan.bloques.push({ clave, clase: "SECTOR", nombre, registro: conRegistro });
      let local = n.inicio;
      for (let j = 1; j <= s.casas; j++) {
        let numero: string;
        do {
          numero =
            n.esquema === "POR_SECTOR"
              ? `${n.prefijo}${s.prefijo}${n.separador}${conCeros(local++, Math.max(n.digitos, 2))}`
              : `${n.prefijo}${conCeros(global++, n.digitos)}`;
        } while (omitir.has(numero.toUpperCase()) && local < 1e6 && global < 1e6);
        const cl = `${clave}-C${j}`;
        plan.unidades.push({ clave: cl, numero: ren(cl, numero), automatico: numero, tipo: "CASA", agrupacion: conRegistro ? clave : undefined, grupo: clave });
      }
    });
  }

  if (tieneEdificios(r)) {
    const e = r.edificios;
    const n = e.numeracion;
    const omitir = listaOmitir(n.omitir);
    let global = n.inicio;
    e.torres.forEach((t, ti) => {
      const clave = `T${ti + 1}`;
      const nombre = ren(clave, t.nombre || letra(ti));
      plan.agrupaciones.push({ clave, tipo: "TORRE", nombre, orden: 100 + ti });
      plan.bloques.push({ clave, clase: "TORRE", nombre, pisos: t.pisos, subterraneos: t.subterraneos, registro: true });
      for (let s = 1; s <= t.subterraneos; s++) {
        plan.agrupaciones.push({ clave: `${clave}-N${s}`, tipo: "NIVEL", nombre: `Subterráneo -${s}`, padre: clave, orden: -s });
      }
      const maxPorPiso = Math.max(t.deptosPorPiso, ...t.excepciones.map((x) => x.unidades));
      const mult = maxPorPiso + n.inicio > 99 ? 1000 : 100;
      let local = n.inicio;
      const prefijo = n.prefijoTorre ? `${t.prefijo}${n.separador}` : "";
      for (let p = 1; p <= t.pisos; p++) {
        const clavePiso = `${clave}-P${p}`;
        plan.agrupaciones.push({ clave: clavePiso, tipo: "PISO", nombre: String(p), padre: clave, orden: p });
        let sufijo = n.inicio;
        for (let j = 1; j <= deptosDelPiso(t, p); j++) {
          let numero: string;
          let vueltas = 0;
          do {
            numero =
              n.esquema === "PISO"
                ? `${prefijo}${p * mult + sufijo++}`
                : `${prefijo}${conCeros(n.serie === "GLOBAL" ? global++ : local++, n.digitos)}`;
          } while (omitir.has(numero.toUpperCase()) && ++vueltas < 1000);
          const cl = `${clavePiso}-U${j}`;
          plan.unidades.push({ clave: cl, numero: ren(cl, numero), automatico: numero, tipo: "DEPARTAMENTO", agrupacion: clavePiso, grupo: clave, piso: p });
        }
      }
    });
  }

  // Estacionamientos y bodegas: numeración propia, independiente de las unidades.
  const espacios = (clase: "ESTACIONAMIENTO" | "BODEGA", resp: RespEspacios, base: string) => {
    const cantidad = resp.modo === "TODOS" ? plan.unidades.length : resp.modo === "ALGUNOS" ? resp.cantidad : 0;
    for (let i = 0; i < cantidad; i++) {
      const codigo = `${resp.prefijo}${conCeros(resp.inicio + i, resp.digitos)}`;
      const cl = `${base}${i + 1}`;
      const u = resp.modo === "TODOS" && resp.proponerVinculo ? plan.unidades[i] : undefined;
      plan.espacios.push({
        clave: cl,
        clase,
        codigo: ren(cl, codigo),
        destino: "PRIVADO",
        accesible: false,
        nota: u ? `Propuesto para la unidad ${u.numero} (por confirmar: no es una asignación)` : undefined,
        grupo: "PRIVADOS",
      });
    }
  };
  espacios("ESTACIONAMIENTO", r.estacionamientos, "EST");
  espacios("BODEGA", r.bodegas, "BOD");

  const extra = (clase: "ESTACIONAMIENTO" | "BODEGA", n: number, base: string, pref: string, destino: Destino | null, accesible: boolean, grupo: EspacioPlan["grupo"]) => {
    for (let i = 1; i <= n; i++) {
      const cl = `${base}${i}`;
      plan.espacios.push({ clave: cl, clase, codigo: ren(cl, `${pref}${conCeros(i, 2)}`), destino, accesible, grupo });
    }
  };
  extra("ESTACIONAMIENTO", r.extras.visitas, "EV", "V-", "VISITAS", false, "VISITAS");
  extra("ESTACIONAMIENTO", r.extras.accesibles, "EA", "EA-", null, true, "VISITAS");
  extra("ESTACIONAMIENTO", r.extras.comunes, "EC", "EC-", "USO_COMUN", false, "OTROS");
  extra("ESTACIONAMIENTO", r.extras.servicio, "ES", "ES-", "SERVICIO", false, "OTROS");
  extra("BODEGA", r.extras.bodegasComunes, "BC", "BC-", "USO_COMUN", false, "OTROS");

  for (let i = 1; i <= r.accesos; i++) {
    const cl = `ACC${i}`;
    plan.instalaciones.push({
      clave: cl,
      tipo: "PORTON",
      codigo: `ACC-${i}`,
      nombre: ren(cl, r.accesos === 1 ? "Acceso principal" : `Acceso ${i}`),
      acceso: true,
    });
  }
  for (const [k, v] of Object.entries(r.instalaciones) as [ClaveInstalacion, { cantidad: number; ubicacion: string }][]) {
    const cat = CATALOGO_INSTALACIONES[k];
    for (let i = 1; i <= v.cantidad; i++) {
      const cl = `INS-${k}-${i}`;
      plan.instalaciones.push({
        clave: cl,
        tipo: cat.tipo,
        codigo: `${cat.prefijo}-${i}`,
        nombre: ren(cl, v.cantidad === 1 ? cat.texto : `${cat.texto} ${i}`),
        ubicacion: v.ubicacion || undefined,
        acceso: false,
      });
    }
  }
  return plan;
}

/** Errores que impiden crear: números repetidos, vacíos o demasiados registros. */
export function validarPlan(plan: Plan): string[] {
  const errores: string[] = [];
  const repetidos = (xs: string[]) => {
    const vistos = new Set<string>();
    const rep = new Set<string>();
    for (const x of xs) (vistos.has(x.toLowerCase()) ? rep : vistos).add(x.toLowerCase());
    return [...rep];
  };
  const ru = repetidos(plan.unidades.map((u) => u.numero));
  if (ru.length) {
    errores.push(
      `Hay números de unidad repetidos (${ru.slice(0, 8).join(", ")}${ru.length > 8 ? "…" : ""}). Cada unidad debe tener un número distinto en toda la comunidad: usa el prefijo de torre o de sector, o corrige los números.`,
    );
  }
  for (const clase of ["ESTACIONAMIENTO", "BODEGA"] as const) {
    const re = repetidos(plan.espacios.filter((e) => e.clase === clase).map((e) => e.codigo));
    if (re.length) errores.push(`Hay ${clase === "BODEGA" ? "bodegas" : "estacionamientos"} con el mismo número (${re.slice(0, 8).join(", ")}).`);
  }
  const ri = repetidos(plan.instalaciones.map((i) => i.codigo));
  if (ri.length) errores.push(`Hay instalaciones con el mismo código (${ri.join(", ")}).`);
  const ra = repetidos(plan.agrupaciones.filter((a) => !a.padre).map((a) => a.nombre));
  if (ra.length) errores.push(`Hay torres o sectores con el mismo nombre (${ra.join(", ")}).`);
  if (plan.unidades.some((u) => !u.numero.trim())) errores.push("Hay unidades sin número.");
  if (plan.unidades.some((u) => u.numero.length > 40)) errores.push("Hay números de unidad de más de 40 caracteres.");
  if (plan.unidades.length > LIMITES.unidades) errores.push(`Son ${plan.unidades.length} unidades: el máximo por vez es ${LIMITES.unidades}.`);
  if (plan.espacios.length > LIMITES.espacios) errores.push(`Son ${plan.espacios.length} estacionamientos y bodegas: el máximo es ${LIMITES.espacios}.`);
  return errores;
}

// ── Comparación con lo que ya existe en Convive ────────────────────────────

export type Existentes = {
  agrupaciones: { id: string; tipo: TipoAgrupacion; nombre: string; padreId: string | null }[];
  unidades: { id: string; numero: string; agrupacionId: string | null }[];
  espacios: { id: string; clase: "ESTACIONAMIENTO" | "BODEGA"; codigo: string }[];
  instalaciones: { id: string; codigo: string; nombre: string }[];
};

/** clave interna del plan → id del registro creado (se guarda al generar). */
export type Registros = Record<string, string>;

export type Comparacion = {
  /** clave del plan → id del registro existente que le corresponde. */
  ids: Registros;
  crear: { agrupaciones: AgrupacionPlan[]; unidades: UnidadPlan[]; espacios: EspacioPlan[]; instalaciones: InstalacionPlan[] };
  reutilizar: { agrupaciones: number; unidades: number; espacios: number; instalaciones: number };
  /** Unidades existentes sin torre, sector ni piso que el plan ubica. */
  ubicar: { id: string; agrupacion: string }[];
  /** Registros que cambian de número o nombre (conservan su historial). */
  renumerar: { tipo: "UNIDAD" | "ESPACIO" | "INSTALACION" | "AGRUPACION"; id: string; de: string; a: string }[];
  /** Lo que existe y el plan no incluye: se conserva, nunca se borra solo. */
  fuera: { unidades: Existentes["unidades"]; espacios: Existentes["espacios"]; instalaciones: Existentes["instalaciones"] };
  errores: string[];
};

const igual = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function comparar(plan: Plan, ex: Existentes, registros: Registros): Comparacion {
  const ids: Registros = {};
  const usados = new Set<string>();
  const res: Comparacion = {
    ids,
    crear: { agrupaciones: [], unidades: [], espacios: [], instalaciones: [] },
    reutilizar: { agrupaciones: 0, unidades: 0, espacios: 0, instalaciones: 0 },
    ubicar: [],
    renumerar: [],
    fuera: { unidades: [], espacios: [], instalaciones: [] },
    errores: validarPlan(plan),
  };

  // 1) Lo ya generado antes (por su id permanente). 2) Lo cargado a mano o por Excel (por su número).
  const buscar = <T extends { id: string }>(clave: string, lista: T[], natural: (x: T) => boolean): T | undefined => {
    const porId = registros[clave] && lista.find((x) => x.id === registros[clave] && !usados.has(x.id));
    const hallado = porId || lista.find((x) => !usados.has(x.id) && natural(x));
    if (hallado) {
      usados.add(hallado.id);
      ids[clave] = hallado.id;
    }
    return hallado;
  };

  for (const a of plan.agrupaciones) {
    const padreId = a.padre ? ids[a.padre] : null;
    if (a.padre && !padreId) {
      res.crear.agrupaciones.push(a);
      continue;
    }
    const h = buscar(a.clave, ex.agrupaciones, (x) => x.tipo === a.tipo && (x.padreId ?? null) === (padreId ?? null) && igual(x.nombre, a.nombre));
    if (!h) res.crear.agrupaciones.push(a);
    else {
      res.reutilizar.agrupaciones++;
      if (!igual(h.nombre, a.nombre)) res.renumerar.push({ tipo: "AGRUPACION", id: h.id, de: h.nombre, a: a.nombre });
    }
  }

  // Primero las coincidencias por id para que un número "liberado" por un cambio no se cruce.
  const pendientes: UnidadPlan[] = [];
  for (const u of plan.unidades) {
    const porId = registros[u.clave] && ex.unidades.find((x) => x.id === registros[u.clave]);
    if (porId && !usados.has(porId.id)) {
      usados.add(porId.id);
      ids[u.clave] = porId.id;
      res.reutilizar.unidades++;
      if (!igual(porId.numero, u.numero)) res.renumerar.push({ tipo: "UNIDAD", id: porId.id, de: porId.numero, a: u.numero });
      if (!porId.agrupacionId && u.agrupacion) res.ubicar.push({ id: porId.id, agrupacion: u.agrupacion });
    } else pendientes.push(u);
  }
  for (const u of pendientes) {
    const h = buscar(u.clave, ex.unidades, (x) => igual(x.numero, u.numero));
    if (!h) res.crear.unidades.push(u);
    else {
      res.reutilizar.unidades++;
      if (!h.agrupacionId && u.agrupacion) res.ubicar.push({ id: h.id, agrupacion: u.agrupacion });
    }
  }

  for (const e of plan.espacios) {
    const h = buscar(e.clave, ex.espacios, (x) => x.clase === e.clase && igual(x.codigo, e.codigo));
    if (!h) res.crear.espacios.push(e);
    else {
      res.reutilizar.espacios++;
      if (!igual(h.codigo, e.codigo)) res.renumerar.push({ tipo: "ESPACIO", id: h.id, de: h.codigo, a: e.codigo });
    }
  }
  for (const i of plan.instalaciones) {
    const h = buscar(i.clave, ex.instalaciones, (x) => igual(x.codigo, i.codigo));
    if (!h) res.crear.instalaciones.push(i);
    else {
      res.reutilizar.instalaciones++;
      if (!igual(h.nombre, i.nombre)) res.renumerar.push({ tipo: "INSTALACION", id: h.id, de: h.nombre, a: i.nombre });
    }
  }

  res.fuera.unidades = ex.unidades.filter((u) => !usados.has(u.id));
  res.fuera.espacios = ex.espacios.filter((e) => !usados.has(e.id));
  res.fuera.instalaciones = ex.instalaciones.filter((i) => !usados.has(i.id));

  // Un número nuevo o cambiado no puede chocar con una unidad existente que queda fuera del plan.
  const ocupados = new Set(res.fuera.unidades.map((u) => u.numero.toLowerCase()));
  const choques = [
    ...res.crear.unidades.map((u) => u.numero),
    ...res.renumerar.filter((r) => r.tipo === "UNIDAD").map((r) => r.a),
  ].filter((n) => ocupados.has(n.toLowerCase()));
  if (choques.length) {
    res.errores.push(
      `Ya existen en Convive unidades con los números ${choques.slice(0, 8).join(", ")}${choques.length > 8 ? "…" : ""} que el plan no reconoce como suyas. Cambia la numeración o corrige esas unidades en Unidades.`,
    );
  }
  const ocupE = new Set(res.fuera.espacios.map((e) => `${e.clase}:${e.codigo.toLowerCase()}`));
  const claseDe = new Map(ex.espacios.map((e) => [e.id, e.clase]));
  const choqueE = [
    ...res.crear.espacios.map((e) => ({ clase: e.clase, codigo: e.codigo })),
    ...res.renumerar.filter((r) => r.tipo === "ESPACIO").map((r) => ({ clase: claseDe.get(r.id), codigo: r.a })),
  ].filter((k) => ocupE.has(`${k.clase}:${k.codigo.toLowerCase()}`));
  if (choqueE.length) res.errores.push(`Ya existen estacionamientos o bodegas con los números ${choqueE.map((k) => k.codigo).slice(0, 8).join(", ")}.`);
  const ocupI = new Set(res.fuera.instalaciones.map((i) => i.codigo.toLowerCase()));
  const choqueI = res.crear.instalaciones.filter((i) => ocupI.has(i.codigo.toLowerCase()));
  if (choqueI.length) res.errores.push(`Ya existen instalaciones con los códigos ${choqueI.map((i) => i.codigo).join(", ")}.`);
  return res;
}

/** Alícuota provisional igual para cada unidad nueva (se corrige después en Unidades o con Excel). */
export function alicuotaProvisional(totalUnidades: number) {
  return totalUnidades > 0 ? Math.floor((100 / totalUnidades) * 1e6) / 1e6 : 0;
}

// ── Plano: distribución esquemática inicial ────────────────────────────────

export type ClaseElemento = "TORRE" | "CASA" | "ESTACIONAMIENTO" | "BODEGA" | "INSTALACION" | "ACCESO";
export type ElementoDibujo = {
  clave: string;
  clase: ClaseElemento;
  etiqueta: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Marco al que pertenece (sector, zona de estacionamientos…), para moverlo junto. */
  marco: string;
  detalle?: string;
};
export type Marco = { clave: string; nombre: string; clase: "SECTOR" | "ZONA" };
export type Posiciones = Record<string, { x: number; y: number }>;

export const ANCHO_PLANO = 1000;

/**
 * Ubica cada elemento en una cuadrícula ordenada: accesos arriba, luego sectores y torres,
 * estacionamientos, bodegas e instalaciones. Las posiciones guardadas reemplazan a las automáticas.
 */
export function distribuir(plan: Plan, guardadas: Posiciones = {}): { elementos: ElementoDibujo[]; marcos: Marco[]; alto: number } {
  const elementos: ElementoDibujo[] = [];
  const marcos: Marco[] = [];
  const M = 30;
  let y = 20;

  // Accesos en el borde superior.
  const accesos = plan.instalaciones.filter((i) => i.acceso);
  accesos.forEach((a, i) => elementos.push({ clave: a.clave, clase: "ACCESO", etiqueta: a.nombre, x: M + i * 130, y, w: 110, h: 30, marco: "" }));
  y += accesos.length ? 60 : 0;

  // Sectores de casas y torres, uno al lado del otro (con salto de línea).
  let x = M;
  let altoFila = 0;
  const colocar = (w: number, h: number) => {
    if (x + w > ANCHO_PLANO - M && x > M) {
      x = M;
      y += altoFila + 30;
      altoFila = 0;
    }
    const pos = { x, y };
    x += w + 30;
    altoFila = Math.max(altoFila, h);
    return pos;
  };
  for (const b of plan.bloques) {
    if (b.clase === "TORRE") {
      const nU = plan.unidades.filter((u) => u.grupo === b.clave).length;
      const p = colocar(150, 120);
      elementos.push({
        clave: b.clave,
        clase: "TORRE",
        etiqueta: b.nombre,
        detalle: `${b.pisos} pisos · ${nU} deptos${b.subterraneos ? ` · ${b.subterraneos} subt.` : ""}`,
        ...p,
        w: 150,
        h: 120,
        marco: "",
      });
    } else {
      const casas = plan.unidades.filter((u) => u.grupo === b.clave);
      const cols = Math.max(1, Math.min(10, Math.ceil(Math.sqrt(casas.length * 2))));
      const filas = Math.ceil(casas.length / cols);
      const w = cols * 46 + 20;
      const h = filas * 42 + 44;
      const p = colocar(w, h);
      marcos.push({ clave: b.clave, nombre: b.nombre, clase: "SECTOR" });
      casas.forEach((c, i) =>
        elementos.push({ clave: c.clave, clase: "CASA", etiqueta: c.numero, x: p.x + 12 + (i % cols) * 46, y: p.y + 34 + Math.floor(i / cols) * 42, w: 38, h: 34, marco: b.clave }),
      );
    }
  }
  y += altoFila + (plan.bloques.length ? 50 : 0);

  // Zonas de estacionamientos y bodegas.
  const zona = (clave: string, nombre: string, items: EspacioPlan[], w: number, h: number, clase: ClaseElemento) => {
    if (!items.length) return;
    const porFila = Math.max(1, Math.floor((ANCHO_PLANO - 2 * M - 24) / (w + 4)));
    marcos.push({ clave, nombre, clase: "ZONA" });
    items.forEach((e, i) =>
      elementos.push({ clave: e.clave, clase, etiqueta: e.codigo, x: M + 12 + (i % porFila) * (w + 4), y: y + 34 + Math.floor(i / porFila) * (h + 4), w, h, marco: clave }),
    );
    y += Math.ceil(items.length / porFila) * (h + 4) + 70;
  };
  const est = plan.espacios.filter((e) => e.clase === "ESTACIONAMIENTO");
  zona("Z-EST", "Estacionamientos", est.filter((e) => e.grupo === "PRIVADOS"), 30, 46, "ESTACIONAMIENTO");
  zona("Z-VIS", "Estacionamientos de visitas y accesibles", est.filter((e) => e.grupo === "VISITAS"), 30, 46, "ESTACIONAMIENTO");
  zona("Z-EOT", "Otros estacionamientos", est.filter((e) => e.grupo === "OTROS"), 30, 46, "ESTACIONAMIENTO");
  zona("Z-BOD", "Bodegas", plan.espacios.filter((e) => e.clase === "BODEGA"), 30, 30, "BODEGA");

  // Instalaciones y espacios comunes.
  x = M;
  altoFila = 0;
  for (const i of plan.instalaciones.filter((i) => !i.acceso)) {
    const p = colocar(130, 64);
    elementos.push({ clave: i.clave, clase: "INSTALACION", etiqueta: i.nombre, detalle: i.codigo, ...p, w: 130, h: 64, marco: "" });
  }
  y += altoFila + 30;

  for (const e of elementos) {
    const g = guardadas[e.clave];
    if (g) {
      e.x = g.x;
      e.y = g.y;
    }
  }
  const alto = Math.max(y, ...elementos.map((e) => e.y + e.h + 30), 300);
  return { elementos, marcos, alto };
}

/** Rectángulo que encierra a los elementos de un marco (sector o zona). */
export function cajaDe(elementos: ElementoDibujo[], marco: string) {
  const xs = elementos.filter((e) => e.marco === marco);
  if (!xs.length) return null;
  const x = Math.min(...xs.map((e) => e.x)) - 12;
  const y = Math.min(...xs.map((e) => e.y)) - 34;
  return { x, y, w: Math.max(...xs.map((e) => e.x + e.w)) + 12 - x, h: Math.max(...xs.map((e) => e.y + e.h)) + 12 - y };
}

/** Tipo de registro de cada elemento del plano (para guardar su posición). */
export function tipoRegistro(clase: ClaseElemento): "AGRUPACION" | "UNIDAD" | "ESPACIO" | "INSTALACION" {
  return clase === "TORRE" ? "AGRUPACION" : clase === "CASA" ? "UNIDAD" : clase === "ESTACIONAMIENTO" || clase === "BODEGA" ? "ESPACIO" : "INSTALACION";
}

/** Resumen corto para mostrar mientras se responde. */
export function resumenPlan(plan: Plan) {
  const casas = plan.unidades.filter((u) => u.tipo === "CASA").length;
  const deptos = plan.unidades.length - casas;
  const est = plan.espacios.filter((e) => e.clase === "ESTACIONAMIENTO").length;
  const bod = plan.espacios.length - est;
  const torres = plan.bloques.filter((b) => b.clase === "TORRE").length;
  const sectores = plan.bloques.filter((b) => b.clase === "SECTOR" && b.registro).length;
  return { casas, deptos, est, bod, torres, sectores, instalaciones: plan.instalaciones.length };
}
