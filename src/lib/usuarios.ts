import "server-only";
import { z } from "zod";

export const ClaveSchema = z
  .string({ error: "Ingresa una contraseña." })
  .min(8, { error: "Mínimo 8 caracteres." });

export const CorreoSchema = z.email({ error: "Correo no válido." }).trim().toLowerCase();
