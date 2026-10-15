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
