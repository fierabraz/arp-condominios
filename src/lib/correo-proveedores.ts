// Envío de correo por la API web de Brevo o Resend. Sin "server-only" para poder probarlo
// con node --test; solo lo usa src/lib/correo.ts, que sí es exclusivo del servidor.

export type ProveedorCorreo = "BREVO" | "RESEND" | "SMTP" | "PRUEBA";

export const NOMBRE_PROVEEDOR: Record<ProveedorCorreo, string> = {
  BREVO: "Brevo",
  RESEND: "Resend",
  SMTP: "Servidor SMTP",
  PRUEBA: "Modo de prueba (no se envía nada)",
};

type Entorno = Record<string, string | undefined>;

/** Qué servicio usar según las variables presentes. Si hay varias, gana la primera de la lista. */
export function proveedorActivo(env: Entorno = process.env): ProveedorCorreo {
  if (env.BREVO_API_KEY?.trim()) return "BREVO";
  if (env.RESEND_API_KEY?.trim()) return "RESEND";
  if (env.SMTP_HOST?.trim()) return "SMTP";
  return "PRUEBA";
}

export type Direccion = { nombre?: string; correo: string };

/** "Convive <avisos@dominio.cl>" o solo "avisos@dominio.cl" (toma el nombre por defecto). */
export function leerDireccion(texto: string | undefined, nombrePorDefecto?: string): Direccion | null {
  const t = texto?.trim();
  if (!t) return null;
  const m = t.match(/^\s*"?([^"<]*?)"?\s*<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/);
  if (m) return { nombre: m[1].trim() || nombrePorDefecto, correo: m[2] };
  if (/^[^\s@<>]+@[^\s@<>]+$/.test(t)) return { nombre: nombrePorDefecto, correo: t };
  return null;
}

export function formatoDireccion(d: Direccion) {
  return d.nombre ? `${d.nombre.replace(/["<>]/g, "")} <${d.correo}>` : d.correo;
}

export type Mensaje = {
  de: Direccion;
  para: string;
  responderA?: Direccion | null;
  asunto: string;
  texto: string;
  html: string;
  adjuntos?: { nombre: string; contenido: Buffer }[];
};

export type Peticion = { url: string; headers: Record<string, string>; body: string };

export function peticionBrevo(m: Mensaje, apiKey: string): Peticion {
  return {
    url: "https://api.brevo.com/v3/smtp/email",
    headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: m.de.nombre, email: m.de.correo },
      to: [{ email: m.para }],
      ...(m.responderA ? { replyTo: { name: m.responderA.nombre, email: m.responderA.correo } } : {}),
      subject: m.asunto,
      textContent: m.texto,
      htmlContent: m.html,
      ...(m.adjuntos?.length
        ? { attachment: m.adjuntos.map((a) => ({ name: a.nombre, content: a.contenido.toString("base64") })) }
        : {}),
    }),
  };
}

export function peticionResend(m: Mensaje, apiKey: string): Peticion {
  return {
    url: "https://api.resend.com/emails",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: formatoDireccion(m.de),
      to: [m.para],
      ...(m.responderA ? { reply_to: formatoDireccion(m.responderA) } : {}),
      subject: m.asunto,
      text: m.texto,
      html: m.html,
      ...(m.adjuntos?.length
        ? { attachments: m.adjuntos.map((a) => ({ filename: a.nombre, content: a.contenido.toString("base64") })) }
        : {}),
    }),
  };
}

/** Traduce los rechazos más comunes del servicio a algo que el administrador pueda resolver. */
export function explicarError(proveedor: ProveedorCorreo, status: number, detalle: string): string {
  const d = detalle.toLowerCase();
  const nombre = NOMBRE_PROVEEDOR[proveedor];
  let pista = "";
  if (status === 401 || d.includes("key not found") || d.includes("api key is invalid") || d.includes("unauthorized")) {
    pista = `La clave de ${nombre} no es válida: revisa la variable ${proveedor}_API_KEY en Vercel.`;
  } else if (d.includes("sender") || d.includes("domain is not verified") || d.includes("verify a domain")) {
    pista = `El remitente no está verificado en ${nombre}: revisa la variable CORREO_REMITENTE y verifica ese correo o dominio en ${nombre}.`;
  } else if (d.includes("only send testing emails")) {
    pista = "Resend solo deja enviar a tu propio correo hasta que verifiques un dominio.";
  } else if (status === 429) {
    pista = `Se alcanzó el límite de envíos de ${nombre}. Espera un rato o revisa tu plan.`;
  } else if (d.includes("not yet activated") || (d.includes("account") && d.includes("activ"))) {
    pista = `La cuenta de ${nombre} todavía no está activada para enviar correos.`;
  }
  const base = `${nombre} respondió ${status}: ${detalle}`.slice(0, 400);
  return pista ? `${pista} (${base})` : base;
}

/** Envía por la API web; reintenta si el servicio pide bajar el ritmo. */
export async function enviarPorApi(
  proveedor: "BREVO" | "RESEND",
  m: Mensaje,
  apiKey: string,
  opciones: { fetch?: typeof fetch; esperaMs?: number } = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  const f = opciones.fetch ?? fetch;
  const peticion = proveedor === "BREVO" ? peticionBrevo(m, apiKey) : peticionResend(m, apiKey);
  for (let intento = 0; ; intento++) {
    let r: Response;
    try {
      r = await f(peticion.url, { method: "POST", headers: peticion.headers, body: peticion.body });
    } catch (e) {
      return { ok: false, error: `No se pudo conectar con ${NOMBRE_PROVEEDOR[proveedor]}: ${(e as Error).message}` };
    }
    if (r.ok) return { ok: true };
    if (r.status === 429 && intento < 3) {
      await new Promise((listo) => setTimeout(listo, (opciones.esperaMs ?? 1000) * (intento + 1)));
      continue;
    }
    const cuerpo = await r.text().catch(() => "");
    let detalle = cuerpo;
    try {
      const j = JSON.parse(cuerpo);
      detalle = j.message ?? j.error ?? cuerpo;
    } catch {
      // Respuesta que no es JSON: se usa tal cual.
    }
    return { ok: false, error: explicarError(proveedor, r.status, String(detalle || r.statusText)) };
  }
}
