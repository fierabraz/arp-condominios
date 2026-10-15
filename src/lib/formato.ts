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

export const CATEGORIAS_GASTO = [
  "Remuneraciones",
  "Electricidad",
  "Agua",
  "Gas",
  "Aseo",
  "Mantención",
  "Reparaciones",
  "Seguridad",
  "Seguros",
  "Administración",
  "Multa",
  "Consumo individual",
  "Otros",
];

export const ETIQUETAS_MEDIO_PAGO = {
  TRANSFERENCIA: "Transferencia",
  EFECTIVO: "Efectivo",
  CHEQUE: "Cheque",
  OTRO: "Otro",
} as const;

export function formatoFecha(fecha: Date) {
  return fecha.toLocaleDateString("es-CL", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Fecha de hoy como YYYY-MM-DD para inputs type=date. */
export function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}
