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
    OR: [{ unidades: { none: {} } }, { unidades: { some: { unidad: { condominioId: { in: ids } } } } }],
  };
}

/** Filtro para el registro de cambios: sin acceso total, solo lo de sus propiedades. */
export function filtroRegistro(a: Alcance) {
  const ids = condominiosPermitidos(a);
  return ids === null ? {} : { condominioId: { in: ids } };
}
