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

export const ZONA_HORARIA = "America/Santiago";

export function formatoFechaHora(fecha: Date) {
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short", timeZone: ZONA_HORARIA }).format(fecha);
}

/** Diferencia en milisegundos entre la hora de Chile y UTC en ese instante (negativa). */
function desfaseChile(instante: Date) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: ZONA_HORARIA,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(instante)
      .map((p) => [p.type, p.value]),
  );
  const local = Date.UTC(+partes.year, +partes.month - 1, +partes.day, +partes.hour, +partes.minute, +partes.second);
  return local - Math.floor(instante.getTime() / 1000) * 1000;
}

/** Último segundo del día indicado ("AAAA-MM-DD"), en hora de Chile. */
export function finDelDiaChile(fecha: string) {
  const [a, m, d] = fecha.split("-").map(Number);
  const comoUtc = Date.UTC(a, m - 1, d, 23, 59, 59);
  return new Date(comoUtc - desfaseChile(new Date(comoUtc)));
}

/** Fecha de hoy en Chile, "AAAA-MM-DD". */
export function hoyChile() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_HORARIA }).format(new Date());
}
