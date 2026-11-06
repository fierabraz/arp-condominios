// Alcance de cada cuenta dentro de su administradora: qué propiedades (comunidades) puede ver.
// Funciones puras para poder probarlas; la sesión y la base de datos están en src/lib/auth.ts.
//
// - Administrador principal: todas las propiedades de su administradora, también las nuevas.
// - Administrador no principal: solo las que tiene asignadas.
// - Comité: solo la propiedad de su cuenta.
// - Residente y plataforma: ninguna desde la administración (el residente tiene su propio portal).

import type { Rol } from "@/generated/prisma/enums";

export type Alcance = {
  rol: Rol;
  accesoTodas: boolean;
  condominioId: string | null;
  asignados: string[];
};

/** Ids de las propiedades que puede ver, o null si ve todas las de su administradora. */
export function condominiosPermitidos(a: Alcance): string[] | null {
  switch (a.rol) {
    case "ADMINISTRADOR":
      return a.accesoTodas ? null : a.asignados;
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
export function esPrincipal(a: Pick<Alcance, "rol" | "accesoTodas">) {
  return a.rol === "ADMINISTRADOR" && a.accesoTodas;
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

export type Perfil = "PRINCIPAL" | "ADMINISTRADOR" | "COMITE" | "RESIDENTE" | "PLATAFORMA";

/** El perfil de una cuenta: el administrador con acceso total es el principal. */
export function perfilDe(a: Pick<Alcance, "rol" | "accesoTodas">): Perfil {
  switch (a.rol) {
    case "ADMINISTRADOR":
      return a.accesoTodas ? "PRINCIPAL" : "ADMINISTRADOR";
    case "COMITE":
      return "COMITE";
    case "RESIDENTE":
      return "RESIDENTE";
    default:
      return "PLATAFORMA";
  }
}

/** Qué perfiles pueden hacer cada cosa. Para dar o quitar un permiso se cambia solo aquí. */
export const PERMISOS = {
  /** Entrar a la administración y ver una propiedad (el comité, solo la suya; en modo lectura). */
  "propiedad.ver": ["PRINCIPAL", "ADMINISTRADOR", "COMITE"],
  /** Cambiar datos, cobrar, registrar y anular pagos, personas, votaciones... (en sus propiedades). */
  "propiedad.administrar": ["PRINCIPAL", "ADMINISTRADOR"],
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
 * true si la cuenta tiene ese permiso. Si se indica una propiedad, además debe alcanzarla
 * (el principal todas las de su administradora, los demás solo las suyas).
 */
export function puede(a: Alcance, permiso: Permiso, condominioId?: string) {
  if (!(PERMISOS[permiso] as readonly Perfil[]).includes(perfilDe(a))) return false;
  return condominioId === undefined || alcanzaCondominio(a, condominioId);
}
