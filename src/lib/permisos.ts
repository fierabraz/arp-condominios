// Alcance de cada cuenta dentro de su administradora: qué propiedades (comunidades) puede ver.
// Funciones puras para poder probarlas; la sesión y la base de datos están en src/lib/auth.ts.
//
// - Administrador principal: todas las propiedades de su administradora, también las nuevas.
// - Administrador no principal: solo las que tiene asignadas.
// - Comité: solo la propiedad de su cuenta.
// - Residente y plataforma: ninguna desde la administración (el residente tiene su propio portal).

import type { CargoEquipo, Rol } from "@/generated/prisma/enums";

export type Alcance = {
  rol: Rol;
  accesoTodas: boolean;
  condominioId: string | null;
  asignados: string[];
  /** PILOTO-001: cargo dentro del equipo (subadministrador, asistente, conserje, personal). */
  cargo?: CargoEquipo | null;
  /** PILOTO-001: permisos adicionales dados por el administrador principal (ver PERMISOS_ASIGNABLES). */
  permisosExtra?: readonly string[];
};

/** Administrador principal: ve todas las comunidades de su administradora. Un cargo nunca lo es. */
const veTodas = (a: Pick<Alcance, "rol" | "accesoTodas" | "cargo">) => a.rol === "ADMINISTRADOR" && a.accesoTodas && !a.cargo;

/** Ids de las propiedades que puede ver, o null si ve todas las de su administradora. */
export function condominiosPermitidos(a: Alcance): string[] | null {
  switch (a.rol) {
    case "ADMINISTRADOR":
      return veTodas(a) ? null : a.asignados;
    case "COMITE":
      return a.condominioId ? [a.condominioId] : [];
    default:
      return [];
  }
}

/** true si la cuenta puede ver esa propiedad (además de que sea de su administradora). */
export function alcanzaCondominio(a: Alcance, condominioId: string) {
  const ids = condominiosPermitidos(a);
  return ids === null || ids.includes(condominioId);
}

/** Filtro para consultas de propiedades: `{}` si ve todas. */
export function filtroCondominios(a: Alcance): { id?: { in: string[] } } {
  const ids = condominiosPermitidos(a);
  return ids === null ? {} : { id: { in: ids } };
}

/** Filtro para consultas de cosas que pertenecen a una propiedad (unidades, períodos...). */
export function filtroPorCondominio(a: Alcance): { condominioId?: { in: string[] } } {
  const ids = condominiosPermitidos(a);
  return ids === null ? {} : { condominioId: { in: ids } };
}

/** Administrador que ve todo: crea propiedades y maneja las cuentas de su administradora. */
export function esPrincipal(a: Pick<Alcance, "rol" | "accesoTodas" | "cargo">) {
  return veTodas(a);
}

/**
 * Filtro para personas: un administrador no principal ve las vinculadas a sus propiedades
 * y las que aún no tienen unidad (recién registradas), no las de otras propiedades.
 */
export function filtroPersonas(a: Alcance) {
  const ids = condominiosPermitidos(a);
  if (ids === null) return {};
  return {
    OR: [
      { unidades: { none: {} }, vinculos: { none: {} } },
      { unidades: { some: { unidad: { condominioId: { in: ids } } } } },
      // COM-001: también quien tuvo o tiene un vínculo (ocupante, o ya terminado) en sus propiedades.
      { vinculos: { some: { unidad: { condominioId: { in: ids } } } } },
    ],
  };
}

/** Filtro para el registro de cambios: sin acceso total, solo lo de sus propiedades. */
export function filtroRegistro(a: Alcance) {
  const ids = condominiosPermitidos(a);
  return ids === null ? {} : { condominioId: { in: ids } };
}

// ---------------------------------------------------------------------------
// SEG-17: catálogo de permisos por perfil. Toda comprobación de "¿puede hacer esto?" pasa por
// `puede`; las funciones requireXxx de src/lib/auth.ts la usan. No cambia lo que cada uno ve.

export type Perfil = "PRINCIPAL" | "ADMINISTRADOR" | "ASISTENTE" | "PERSONAL" | "COMITE" | "RESIDENTE" | "PLATAFORMA";

/**
 * El perfil de una cuenta: el administrador con acceso total es el principal. PILOTO-001: el
 * subadministrador es un administrador asignado; el asistente y el personal (conserje o personal
 * autorizado) tienen perfiles propios con menos permisos.
 */
export function perfilDe(a: Pick<Alcance, "rol" | "accesoTodas" | "cargo">): Perfil {
  switch (a.rol) {
    case "ADMINISTRADOR":
      if (a.cargo === "ASISTENTE") return "ASISTENTE";
      if (a.cargo === "CONSERJE" || a.cargo === "PERSONAL") return "PERSONAL";
      return veTodas(a) ? "PRINCIPAL" : "ADMINISTRADOR";
    case "COMITE":
      return "COMITE";
    case "RESIDENTE":
      return "RESIDENTE";
    case "SUPERADMIN":
      return "PLATAFORMA";
  }
}

/** Qué perfiles pueden hacer cada cosa. Para dar o quitar un permiso se cambia solo aquí. */
export const PERMISOS = {
  /** Entrar a la administración y ver una propiedad (el comité, solo la suya; en modo lectura). */
  "propiedad.ver": ["PRINCIPAL", "ADMINISTRADOR", "ASISTENTE", "PERSONAL", "COMITE"],
  /** Cambiar datos, cobrar, registrar y anular pagos, personas, votaciones... (en sus propiedades). */
  "propiedad.administrar": ["PRINCIPAL", "ADMINISTRADOR", "ASISTENTE"],
  /** PILOTO-001: aprobar o rechazar las solicitudes de residentes para vincularse con una unidad. */
  "solicitudes.revisar": ["PRINCIPAL", "ADMINISTRADOR"],
  /** FIN-003.1: registrar cuentas bancarias, importar cartolas y manejar perfiles de cartola. */
  "banco.importar": ["PRINCIPAL", "ADMINISTRADOR"],
  /** PAG-001: datos para transferir de la comunidad y verificar las transferencias informadas por residentes. */
  "pagos.verificar": ["PRINCIPAL", "ADMINISTRADOR"],
  /** Crear propiedades nuevas. */
  "propiedades.crear": ["PRINCIPAL"],
  /** Habilitar o deshabilitar los cobros de una propiedad (COM-001). */
  "propiedad.habilitarCobros": ["PRINCIPAL"],
  /** Crear y quitar cuentas de la administradora y decidir qué propiedades ve cada una. */
  "cuentas.administrar": ["PRINCIPAL"],
  /** El portal del residente (/mi-cuenta). */
  "portal.residente": ["RESIDENTE"],
  /** La plataforma: administradoras, cuentas de todos y correo de prueba. */
  plataforma: ["PLATAFORMA"],
} as const satisfies Record<string, readonly Perfil[]>;

export type Permiso = keyof typeof PERMISOS;

/**
 * PILOTO-001: permisos que el administrador principal puede dar, uno por uno, a un subadministrador
 * o a un asistente. Nunca a conserjes, personal, comité ni residentes, y nunca los de plataforma
 * o de manejo de cuentas.
 */
export const PERMISOS_ASIGNABLES = {
  "pagos.verificar": "Verificar transferencias y datos para transferir",
  "banco.importar": "Cuentas bancarias y cartolas",
  "solicitudes.revisar": "Aprobar solicitudes de residentes",
} as const satisfies Partial<Record<Permiso, string>>;

export type PermisoAsignable = keyof typeof PERMISOS_ASIGNABLES;
const PERFILES_CON_EXTRAS: Perfil[] = ["ADMINISTRADOR", "ASISTENTE"];

export const esPermisoAsignable = (p: string): p is PermisoAsignable => Object.hasOwn(PERMISOS_ASIGNABLES, p);

/**
 * true si la cuenta tiene ese permiso. Si se indica una propiedad, además debe alcanzarla
 * (el principal todas las de su administradora, los demás solo las suyas).
 */
export function puede(a: Alcance, permiso: Permiso, condominioId?: string) {
  const perfil = perfilDe(a);
  const porPerfil = (PERMISOS[permiso] as readonly Perfil[]).includes(perfil);
  const extra =
    PERFILES_CON_EXTRAS.includes(perfil) && esPermisoAsignable(permiso) && (a.permisosExtra ?? []).includes(permiso);
  if (!porPerfil && !extra) return false;
  return condominioId === undefined || alcanzaCondominio(a, condominioId);
}
