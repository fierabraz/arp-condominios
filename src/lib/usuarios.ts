import "server-only";
import { z } from "zod";

export const ClaveSchema = z
  .string({ error: "Ingresa una contraseña." })
  .min(8, { error: "Mínimo 8 caracteres." });

export const CorreoSchema = z.email({ error: "Correo no válido." }).trim().toLowerCase();

/** Contraseña nueva escrita dos veces (recuperación e invitación). */
export const ClaveNuevaSchema = z
  .object({ nueva: ClaveSchema, repetir: z.string({ error: "Repite la contraseña." }) })
  .refine((d) => d.nueva === d.repetir, { error: "Las contraseñas no coinciden.", path: ["repetir"] });
