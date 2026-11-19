// IA-002 · Asistente de ayuda de Convive: reglas puras (sin base de datos ni red) para poder probarlas.
// Configuración por variables de entorno, límites de uso, limpieza de la conversación y costo estimado.

/** Modelo por omisión. Se puede cambiar sin tocar el código con la variable ASISTENTE_MODELO. */
export const MODELO_POR_OMISION = "claude-opus-5-5";

/** Largo máximo de una pregunta (caracteres). */
export const MAX_PREGUNTA = 1000;
/** Mensajes anteriores que se reenvían como contexto (pregunta y respuesta cuentan por separado). */
export const MAX_HISTORIAL = 10;
/** Largo máximo de cada mensaje anterior que se reenvía. */
export const MAX_MENSAJE_HISTORIAL = 4000;

export type ConfigAsistente = {
  activo: boolean;
  modelo: string;
  /** Preguntas por persona y día (hora de Chile). */
  limitePersona: number;
  /** Preguntas de toda la plataforma por día: tope de seguridad para el costo. */
  limiteTotal: number;
};

function entero(valor: string | undefined, porOmision: number, min: number, max: number) {
  const n = Number.parseInt(valor ?? "", 10);
  if (!Number.isFinite(n)) return porOmision;
  return Math.min(max, Math.max(min, n));
}

/**
 * Lee la configuración. Sin ANTHROPIC_API_KEY el asistente queda apagado y no se muestra.
 * ASISTENTE_ACTIVO=no lo apaga aunque la clave exista (para pausarlo sin borrarla).
 */
export function configAsistente(env: Record<string, string | undefined> = process.env): ConfigAsistente {
  const clave = (env.ANTHROPIC_API_KEY ?? "").trim();
  const pausado = /^(no|false|0|off)$/i.test((env.ASISTENTE_ACTIVO ?? "").trim());
  return {
    activo: clave.length > 0 && !pausado,
    modelo: (env.ASISTENTE_MODELO ?? "").trim() || MODELO_POR_OMISION,
    limitePersona: entero(env.ASISTENTE_LIMITE_DIARIO, 20, 1, 500),
    limiteTotal: entero(env.ASISTENTE_LIMITE_TOTAL_DIARIO, 300, 1, 100000),
  };
}

export type MensajeChat = { rol: "usuario" | "asistente"; texto: string };

/**
 * Limpia la conversación que manda el navegador: solo texto, largo acotado, empieza con una
 * pregunta y alterna pregunta/respuesta. El navegador no es de confianza; esto solo da forma.
 * Los datos que el asistente puede consultar los decide el servidor, no esta conversación.
 */
export function limpiarHistorial(historial: unknown): MensajeChat[] {
  if (!Array.isArray(historial)) return [];
  const validos: MensajeChat[] = [];
  for (const m of historial) {
    if (!m || typeof m !== "object") continue;
    const { rol, texto } = m as Record<string, unknown>;
    if ((rol !== "usuario" && rol !== "asistente") || typeof texto !== "string") continue;
    const limpio = texto.trim().slice(0, MAX_MENSAJE_HISTORIAL);
    if (!limpio) continue;
    // Dos seguidos del mismo lado: queda el último.
    if (validos.length && validos[validos.length - 1].rol === rol) validos.pop();
    validos.push({ rol, texto: limpio });
  }
  let recientes = validos.slice(-MAX_HISTORIAL);
  // Debe empezar con una pregunta y terminar con una respuesta (la pregunta nueva va aparte).
  while (recientes.length && recientes[0].rol !== "usuario") recientes = recientes.slice(1);
  while (recientes.length && recientes[recientes.length - 1].rol !== "asistente") recientes = recientes.slice(0, -1);
  return recientes;
}

/** Valida la pregunta nueva. Devuelve el texto limpio o un mensaje de error para la persona. */
export function validarPregunta(pregunta: unknown): { ok: true; texto: string } | { ok: false; error: string } {
  if (typeof pregunta !== "string" || !pregunta.trim()) return { ok: false, error: "Escribe tu pregunta." };
  const texto = pregunta.trim();
  if (texto.length > MAX_PREGUNTA) {
    return { ok: false, error: `La pregunta es muy larga: máximo ${MAX_PREGUNTA} caracteres.` };
  }
  return { ok: true, texto };
}

export type MotivoLimite = "persona" | "total" | null;

/** ¿Se puede hacer otra pregunta hoy? */
export function revisarLimite(usadasPersona: number, usadasTotal: number, config: ConfigAsistente): MotivoLimite {
  if (usadasTotal >= config.limiteTotal) return "total";
  if (usadasPersona >= config.limitePersona) return "persona";
  return null;
}

export const MENSAJES_LIMITE: Record<Exclude<MotivoLimite, null>, string> = {
  persona: "Llegaste al límite de preguntas de hoy. Mañana puedes volver a preguntar.",
  total: "El asistente llegó a su límite de uso de hoy. Vuelve a intentarlo mañana.",
};

/** Precio por millón de tokens (dólares), para estimar el costo en la pantalla de plataforma. */
const PRECIOS: Record<string, { entrada: number; salida: number }> = {
  "claude-opus-5-5": { entrada: 4, salida: 20 },
  "claude-sonnet-5-5": { entrada: 2, salida: 10 },
  "claude-haiku-5-5": { entrada: 0.1, salida: 0.5 },
};

export type UsoTokens = { entrada: number; salida: number; cacheLectura: number; cacheEscritura: number };

/**
 * Costo estimado en dólares (referencial: el valor oficial es el de console.anthropic.com).
 * La lectura de caché cuesta 0,1 veces la entrada y la escritura 1,25 veces. null si el modelo no está en la tabla.
 */
export function costoEstimado(modelo: string, uso: UsoTokens): number | null {
  const p = PRECIOS[modelo];
  if (!p) return null;
  const entrada = uso.entrada + uso.cacheLectura * 0.1 + uso.cacheEscritura * 1.25;
  return (entrada * p.entrada + uso.salida * p.salida) / 1_000_000;
}
