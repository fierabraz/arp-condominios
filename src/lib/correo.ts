import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import nodemailer from "nodemailer";
import { MARCA } from "@/lib/marca";
import {
  enviarPorApi,
  formatoDireccion,
  leerDireccion,
  proveedorActivo,
  type Direccion,
  type ProveedorCorreo,
} from "@/lib/correo-proveedores";

export type Correo = {
  para: string;
  asunto: string;
  texto: string;
  html: string;
  adjuntos?: { nombre: string; contenido: Buffer }[];
};

export type ResultadoEnvio = { estado: "ENVIADO" | "SIMULADO" | "ERROR"; error?: string };

// En Vercel el disco es de solo lectura salvo la carpeta temporal.
const CARPETA_SIMULADOS = process.env.VERCEL
  ? path.join(os.tmpdir(), "correos-simulados")
  : path.join(process.cwd(), "correos-simulados");

export { proveedorActivo };

/** true si hay un servicio de correo real configurado (Brevo, Resend o SMTP). */
export function correoConfigurado() {
  return proveedorActivo() !== "PRUEBA";
}

/** Remitente: CORREO_REMITENTE (o SMTP_FROM, el nombre antiguo). Sin nombre, se usa el de la marca. */
export function remitente(): Direccion {
  return (
    leerDireccion(process.env.CORREO_REMITENTE, MARCA.nombre) ??
    leerDireccion(process.env.SMTP_FROM, MARCA.nombre) ??
    leerDireccion(MARCA.remitente)!
  );
}

function responderA() {
  return leerDireccion(process.env.CORREO_RESPONDER_A);
}

/** Resumen de la configuración, sin claves, para la pantalla de prueba de correo. */
export function configuracionCorreo(): { proveedor: ProveedorCorreo; remitente: string; responderA: string | null } {
  const r = responderA();
  return { proveedor: proveedorActivo(), remitente: formatoDireccion(remitente()), responderA: r && formatoDireccion(r) };
}

function transporteSmtp() {
  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

/**
 * Envía un correo con el servicio configurado (ver proveedorActivo). Sin ninguno, guarda el
 * mensaje como .eml en correos-simulados/ para poder revisarlo, y lo informa como SIMULADO.
 */
export async function enviarCorreo(correo: Correo): Promise<ResultadoEnvio> {
  const proveedor = proveedorActivo();
  const de = remitente();
  try {
    if (proveedor === "BREVO" || proveedor === "RESEND") {
      const clave = (proveedor === "BREVO" ? process.env.BREVO_API_KEY : process.env.RESEND_API_KEY)!.trim();
      const r = await enviarPorApi(proveedor, { ...correo, de, responderA: responderA() }, clave);
      if (r.ok) return { estado: "ENVIADO" };
      console.error(`No se pudo enviar el correo a ${correo.para}: ${r.error}`);
      return { estado: "ERROR", error: r.error.slice(0, 500) };
    }

    const mensaje = {
      from: formatoDireccion(de),
      replyTo: responderA() ? formatoDireccion(responderA()!) : undefined,
      to: correo.para,
      subject: correo.asunto,
      text: correo.texto,
      html: correo.html,
      attachments: correo.adjuntos?.map((a) => ({ filename: a.nombre, content: a.contenido })),
    };
    if (proveedor === "SMTP") {
      await transporteSmtp().sendMail(mensaje);
      return { estado: "ENVIADO" };
    }
    const info = await nodemailer
      .createTransport({ streamTransport: true, buffer: true, newline: "unix" })
      .sendMail(mensaje);
    await guardarCopia(correo.para, info.message as Buffer);
    return { estado: "SIMULADO" };
  } catch (e) {
    console.error(`No se pudo enviar el correo a ${correo.para}: ${(e as Error).message}`);
    return { estado: "ERROR", error: (e as Error).message.slice(0, 500) };
  }
}

async function guardarCopia(para: string, mensaje: Buffer) {
  try {
    await mkdir(CARPETA_SIMULADOS, { recursive: true });
    const nombre = `${new Date().toISOString().replace(/[:.]/g, "-")}-${para.replace(/[^\w.@-]/g, "_")}.eml`;
    await writeFile(path.join(CARPETA_SIMULADOS, nombre), mensaje);
  } catch {
    // La copia es solo para revisión; si no se puede guardar, el envío simulado sigue siendo válido.
  }
}

export function escaparHtml(texto: string) {
  return texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
