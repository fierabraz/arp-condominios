import type { z } from "zod";

export type EstadoForm = {
  errores?: Record<string, string[] | undefined>;
  mensaje?: string;
  ok?: boolean;
  /** Lo que se envió, para no borrar el formulario cuando hay que corregir algo. */
  valores?: Record<string, string>;
};

export function erroresDe(error: z.ZodError): EstadoForm {
  const errores: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const campo = String(issue.path[0] ?? "_");
    (errores[campo] ??= []).push(issue.message);
  }
  return { errores };
}

/** Convierte "1,25" o "1.25" a número; vacío queda como undefined. */
export function aNumero(valor: FormDataEntryValue | null) {
  if (valor === null || String(valor).trim() === "") return undefined;
  return Number(String(valor).replace(",", "."));
}

export function aTexto(valor: FormDataEntryValue | null) {
  const s = valor === null ? "" : String(valor).trim();
  return s === "" ? undefined : s;
}

/** "1.234.567" o "1234567,5" → número. */
export function aMonto(valor: FormDataEntryValue | null) {
  const s = aTexto(valor);
  if (!s) return undefined;
  const limpio = s.replace(/\$|\s/g, "");
  // Si tiene coma, la coma es decimal y los puntos son miles.
  return Number(limpio.includes(",") ? limpio.replace(/\./g, "").replace(",", ".") : limpio.replace(/\.(?=\d{3}(\D|$))/g, ""));
}

/** "2026-12-01" (campo de fecha) → ese día a medianoche UTC; vacío → null; otra cosa → fecha inválida. */
export function aFechaDia(valor: FormDataEntryValue | null) {
  const s = aTexto(valor);
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : new Date(NaN);
}

/** Fecha guardada como día → "2026-12-01" para un campo de fecha. */
export const diaISO = (fecha: Date | null | undefined) => (fecha ? fecha.toISOString().slice(0, 10) : "");
