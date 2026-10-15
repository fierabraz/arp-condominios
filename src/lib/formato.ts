export function formatoMoneda(valor: number | string | { toString(): string }, moneda = "CLP") {
  const n = typeof valor === "number" ? valor : Number(valor.toString());
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: moneda,
    maximumFractionDigits: moneda === "CLP" ? 0 : 2,
  }).format(n);
}

export function formatoPorcentaje(valor: number | string | { toString(): string }, decimales = 4) {
  const n = typeof valor === "number" ? valor : Number(valor.toString());
  return `${n.toLocaleString("es-CL", { maximumFractionDigits: decimales })} %`;
}

export const ETIQUETAS_ROL = {
  SUPERADMIN: "Plataforma",
  ADMINISTRADOR: "Administrador",
  COMITE: "Comité",
  RESIDENTE: "Residente",
} as const;

export const ETIQUETAS_TIPO_UNIDAD = {
  DEPARTAMENTO: "Departamento",
  CASA: "Casa",
  OFICINA: "Oficina",
  LOCAL: "Local",
  ESTACIONAMIENTO: "Estacionamiento",
  BODEGA: "Bodega",
} as const;
