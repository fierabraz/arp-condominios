import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import type { UsuarioActual } from "@/lib/auth";
import { finDelDiaChile, formatoFechaLarga, hoyChile } from "@/lib/formato";
import { comunidadDeLaPagina, ejecutarHerramienta, herramientasPara } from "./herramientas";
import { contextoDeLaPregunta, INSTRUCCIONES, type PerfilAsistente } from "./guia";
import {
  configAsistente,
  limpiarHistorial,
  MENSAJES_LIMITE,
  revisarLimite,
  validarPregunta,
  type UsoTokens,
} from "./reglas";

// IA-002 · Asistente de ayuda: una pregunta → la IA consulta (si hace falta) las herramientas de
// solo lectura de esta cuenta → respuesta. Usa la API de Anthropic con la clave ANTHROPIC_API_KEY.

export type RespuestaAsistente = { ok: true; texto: string; restantes: number } | { ok: false; error: string };

/** Vueltas máximas pregunta → herramienta → respuesta, para que una pregunta no gaste de más. */
const MAX_VUELTAS = 4;

/** Modelos que aceptan el respaldo automático si el modelo principal declina responder. */
const CON_RESPALDO = /^claude-(opus-5-5|opus-5|sonnet-5-5|fable-5)/;

function perfilDe(usuario: UsuarioActual): PerfilAsistente | null {
  if (usuario.rol === "ADMINISTRADOR" || usuario.rol === "COMITE" || usuario.rol === "RESIDENTE") return usuario.rol;
  return null;
}

/** Inicio del día de hoy en Chile. */
function inicioDelDia() {
  return new Date(finDelDiaChile(hoyChile()).getTime() - 24 * 60 * 60 * 1000 + 1000);
}

/** ¿Se muestra el asistente a esta cuenta? */
export function asistenteDisponible(usuario: UsuarioActual) {
  return configAsistente().activo && perfilDe(usuario) !== null;
}

export async function preguntarAlAsistente(
  usuario: UsuarioActual,
  entrada: { pregunta: unknown; historial: unknown; ruta: unknown },
): Promise<RespuestaAsistente> {
  const config = configAsistente();
  const perfil = perfilDe(usuario);
  if (!config.activo || !perfil) return { ok: false, error: "El asistente no está disponible." };

  const pregunta = validarPregunta(entrada.pregunta);
  if (!pregunta.ok) return pregunta;

  const desde = inicioDelDia();
  const [usadasPersona, usadasTotal] = await Promise.all([
    db.consultaAsistente.count({ where: { usuarioId: usuario.id, creadoEn: { gte: desde } } }),
    db.consultaAsistente.count({ where: { creadoEn: { gte: desde } } }),
  ]);
  const motivo = revisarLimite(usadasPersona, usadasTotal, config);
  if (motivo) return { ok: false, error: MENSAJES_LIMITE[motivo] };

  // Se anota antes de llamar a la IA: así dos preguntas al mismo tiempo también cuentan para el límite.
  const consulta = await db.consultaAsistente.create({
    data: { usuarioId: usuario.id, administradoraId: usuario.administradoraId, rol: usuario.rol, modelo: config.modelo },
  });
  const uso: UsoTokens = { entrada: 0, salida: 0, cacheLectura: 0, cacheEscritura: 0 };
  const guardar = (exitosa: boolean) =>
    db.consultaAsistente.update({
      where: { id: consulta.id },
      data: {
        exitosa,
        tokensEntrada: uso.entrada,
        tokensSalida: uso.salida,
        tokensCacheLectura: uso.cacheLectura,
        tokensCacheEscritura: uso.cacheEscritura,
      },
    });

  const ruta = typeof entrada.ruta === "string" ? entrada.ruta.slice(0, 200) : null;
  const comunidad = perfil === "RESIDENTE" ? null : await comunidadDeLaPagina(usuario, ruta);
  const system: Anthropic.Beta.Messages.BetaTextBlockParam[] = [
    // La parte fija se guarda en caché (más barata desde la segunda pregunta).
    { type: "text", text: INSTRUCCIONES, cache_control: { type: "ephemeral" } },
    {
      type: "text",
      text: contextoDeLaPregunta({ perfil, nombre: usuario.nombre, fecha: formatoFechaLarga(new Date()), ruta, comunidad }),
    },
  ];
  const tools = herramientasPara(usuario).map((h) => h.definicion);
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [
    ...limpiarHistorial(entrada.historial).map((m) => ({
      role: m.rol === "usuario" ? ("user" as const) : ("assistant" as const),
      content: m.texto,
    })),
    { role: "user", content: pregunta.texto },
  ];

  const client = new Anthropic({ timeout: 60_000, maxRetries: 1 });
  try {
    for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
      const respuesta = await client.beta.messages.create({
        model: config.modelo,
        max_tokens: 4000,
        system,
        tools,
        messages,
        // Preguntas de ayuda: poco razonamiento basta y responde más rápido y barato.
        output_config: { effort: "low" },
        ...(CON_RESPALDO.test(config.modelo)
          ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
          : {}),
      });
      uso.entrada += respuesta.usage.input_tokens;
      uso.salida += respuesta.usage.output_tokens;
      uso.cacheLectura += respuesta.usage.cache_read_input_tokens ?? 0;
      uso.cacheEscritura += respuesta.usage.cache_creation_input_tokens ?? 0;

      if (respuesta.stop_reason === "refusal") {
        await guardar(true);
        return { ok: true, texto: "No puedo ayudarte con eso. Prueba con otra pregunta sobre Convive.", restantes: config.limitePersona - usadasPersona - 1 };
      }

      const llamadas = respuesta.content.filter((b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === "tool_use");
      if (respuesta.stop_reason === "tool_use" && llamadas.length > 0 && vuelta < MAX_VUELTAS - 1) {
        messages.push({ role: "assistant", content: respuesta.content });
        const resultados: Anthropic.Beta.Messages.BetaToolResultBlockParam[] = [];
        for (const llamada of llamadas) {
          try {
            const datos = await ejecutarHerramienta(usuario, llamada.name, llamada.input);
            resultados.push({ type: "tool_result", tool_use_id: llamada.id, content: JSON.stringify(datos) });
          } catch (e) {
            console.error("Asistente: falló la herramienta", llamada.name, e);
            resultados.push({ type: "tool_result", tool_use_id: llamada.id, content: "No se pudo consultar ese dato.", is_error: true });
          }
        }
        messages.push({ role: "user", content: resultados });
        continue;
      }

      const texto = respuesta.content
        .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      await guardar(true);
      return {
        ok: true,
        texto: texto || "No encontré una respuesta. Intenta preguntarlo de otra forma.",
        restantes: Math.max(0, config.limitePersona - usadasPersona - 1),
      };
    }
    await guardar(true);
    return { ok: false, error: "La pregunta necesitó demasiados pasos. Intenta hacerla más concreta." };
  } catch (e) {
    await guardar(false).catch(() => {});
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
      console.error("Asistente: la clave ANTHROPIC_API_KEY no es válida o no tiene permiso.", e.status);
      return { ok: false, error: "El asistente no está bien configurado. Avísale a la administración de Convive." };
    }
    if (e instanceof Anthropic.RateLimitError) {
      return { ok: false, error: "El asistente está ocupado. Intenta de nuevo en un minuto." };
    }
    if (e instanceof Anthropic.APIError) {
      console.error("Asistente: error del servicio de IA", e.status, e.message);
      return { ok: false, error: "El asistente no pudo responder ahora. Intenta de nuevo en unos minutos." };
    }
    console.error("Asistente: error inesperado", e);
    return { ok: false, error: "El asistente no pudo responder ahora. Intenta de nuevo en unos minutos." };
  }
}
