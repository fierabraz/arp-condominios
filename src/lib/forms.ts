import type { z } from "zod";

export type EstadoForm = {
  errores?: Record<string, string[] | undefined>;
  mensaje?: string;
  ok?: boolean;
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
