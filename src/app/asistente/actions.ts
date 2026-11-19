"use server";

import { getUsuarioActual } from "@/lib/auth";
import { preguntarAlAsistente, type RespuestaAsistente } from "@/lib/asistente/servicio";

// IA-002 · Pregunta al asistente de ayuda. La cuenta sale de la sesión (nunca del navegador);
// lo que el asistente puede consultar depende solo de esa cuenta.
export async function preguntarAsistente(entrada: {
  pregunta: string;
  historial: { rol: "usuario" | "asistente"; texto: string }[];
  ruta: string;
}): Promise<RespuestaAsistente> {
  const usuario = await getUsuarioActual();
  if (!usuario) return { ok: false, error: "Tu sesión terminó. Vuelve a ingresar." };
  return preguntarAlAsistente(usuario, entrada);
}
