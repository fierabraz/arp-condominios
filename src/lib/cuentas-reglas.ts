// PILOTO-001: reglas del registro de cuentas. Funciones puras para poder probarlas; lo que toca
// la base de datos está en src/lib/cuentas.ts.

import type { TipoVinculo } from "./vinculos";

/** Deja un código como se guarda: mayúsculas, sin espacios; acepta que lo escriban sin guiones. */
export function normalizarCodigo(codigo: string) {
  const limpio = codigo.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (limpio.startsWith("CV") && limpio.length === 14) {
    return `CV-${limpio.slice(2, 6)}-${limpio.slice(6, 10)}-${limpio.slice(10)}`;
  }
  if (limpio.length === 8) return `${limpio.slice(0, 4)}-${limpio.slice(4)}`;
  return limpio;
}

export type EstadoCodigo = "VALIDO" | "VENCIDO" | "AGOTADO" | "ANULADO" | "OTRO_CORREO";

export type CodigoRegistroDatos = {
  correo: string | null;
  usos: number;
  usosMaximos: number;
  expiraEn: Date;
  anuladoEn: Date | null;
};

/** Si un código de acceso sirve para registrar ese correo ahora. */
export function estadoCodigo(c: CodigoRegistroDatos, correo: string | null, ahora: Date): EstadoCodigo {
  if (c.anuladoEn) return "ANULADO";
  if (c.expiraEn <= ahora) return "VENCIDO";
  if (c.usos >= c.usosMaximos) return "AGOTADO";
  if (c.correo && correo !== null && c.correo.toLowerCase() !== correo.toLowerCase()) return "OTRO_CORREO";
  return "VALIDO";
}

export const MENSAJE_CODIGO: Record<Exclude<EstadoCodigo, "VALIDO">, string> = {
  ANULADO: "Este código de acceso fue anulado. Pide uno nuevo a Convive.",
  VENCIDO: "Este código de acceso venció. Pide uno nuevo a Convive.",
  AGOTADO: "Este código de acceso ya se usó. Pide uno nuevo a Convive.",
  OTRO_CORREO: "Este código de acceso es para otro correo. Usa el correo al que te lo enviaron.",
};

export type RelacionDeclarada = "PROPIETARIO_RESIDENTE" | "PROPIETARIO_NO_RESIDENTE" | "ARRENDATARIO" | "OCUPANTE_AUTORIZADO";

export const RELACIONES: Record<RelacionDeclarada, { texto: string; ayuda: string }> = {
  PROPIETARIO_RESIDENTE: { texto: "Propietario/a y vivo ahí", ayuda: "Es dueño/a de la unidad y vive en ella." },
  PROPIETARIO_NO_RESIDENTE: {
    texto: "Propietario/a, pero no vivo ahí",
    ayuda: "Es dueño/a de la unidad, pero la arrienda o la usa otra persona.",
  },
  ARRENDATARIO: { texto: "Arrendatario/a", ayuda: "Arrienda la unidad y vive en ella." },
  OCUPANTE_AUTORIZADO: {
    texto: "Residente u ocupante autorizado/a",
    ayuda: "Vive en la unidad con autorización del dueño (familiar, por ejemplo).",
  },
};

export const ORDEN_RELACIONES: RelacionDeclarada[] = [
  "PROPIETARIO_RESIDENTE",
  "PROPIETARIO_NO_RESIDENTE",
  "ARRENDATARIO",
  "OCUPANTE_AUTORIZADO",
];

/**
 * Vínculos de COM-001 que se registran al aprobar cada relación. El propietario residente queda
 * con dos (propietario y residente); el no residente, solo propietario. El arrendatario y el
 * residente no son dueños: no votan, pero ven los cobros de la unidad.
 */
export function vinculosDeRelacion(r: RelacionDeclarada): TipoVinculo[] {
  switch (r) {
    case "PROPIETARIO_RESIDENTE":
      return ["PROPIETARIO", "RESIDENTE"];
    case "PROPIETARIO_NO_RESIDENTE":
      return ["PROPIETARIO"];
    case "ARRENDATARIO":
      return ["ARRENDATARIO"];
    case "OCUPANTE_AUTORIZADO":
      return ["RESIDENTE"];
  }
}

/** Compara lo que escribió la persona ("depto 302", "302") con el número de una unidad. */
export function coincideUnidad(texto: string, numero: string) {
  const solo = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const t = solo(texto);
  const n = solo(numero);
  if (!t || !n) return false;
  if (t === n) return true;
  // "DEPTO302", "CASA12B": el número va al final.
  return t.endsWith(n) && !/[0-9]/.test(t.slice(0, t.length - n.length).slice(-1));
}

/** Máximo de solicitudes pendientes que puede tener una cuenta a la vez. */
export const MAX_SOLICITUDES_PENDIENTES = 3;

export const CARGOS = {
  SUBADMINISTRADOR: {
    texto: "Subadministrador/a",
    ayuda: "Administra las comunidades que le asignes: cobros, pagos, personas, publicaciones.",
  },
  ASISTENTE: {
    texto: "Asistente administrativo/a",
    ayuda: "Hace el trabajo administrativo en sus comunidades. No verifica pagos ni ve el banco, salvo que se lo permitas.",
  },
  CONSERJE: { texto: "Conserje", ayuda: "Solo consulta sus comunidades. No cambia datos." },
  PERSONAL: { texto: "Personal autorizado", ayuda: "Solo consulta sus comunidades. No cambia datos." },
} as const;

export type Cargo = keyof typeof CARGOS;

/** Nombre del perfil de una cuenta de administración para mostrarlo. */
export function textoPerfil(u: { rol: string; accesoTodas: boolean; cargo: Cargo | null }) {
  if (u.rol === "ADMINISTRADOR") {
    if (u.cargo) return CARGOS[u.cargo].texto;
    return u.accesoTodas ? "Administrador/a principal" : "Administrador/a";
  }
  if (u.rol === "COMITE") return "Comité (solo lectura)";
  if (u.rol === "RESIDENTE") return "Residente";
  return "Plataforma";
}
