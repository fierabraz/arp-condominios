import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";

export type Correo = {
  para: string;
  asunto: string;
  texto: string;
  html: string;
  adjuntos?: { nombre: string; contenido: Buffer }[];
};

export type ResultadoEnvio = { estado: "ENVIADO" | "SIMULADO" | "ERROR"; error?: string };

const CARPETA_SIMULADOS = path.join(process.cwd(), "correos-simulados");

export function smtpConfigurado() {
  return !!process.env.SMTP_HOST;
}

function transporte() {
  if (!smtpConfigurado()) {
    return nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
  }
  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

/**
 * Envía un correo. Sin servidor SMTP configurado, guarda el mensaje como .eml en
 * correos-simulados/ para poder revisarlo, y lo informa como SIMULADO.
 */
export async function enviarCorreo(correo: Correo): Promise<ResultadoEnvio> {
  try {
    const info = await transporte().sendMail({
      from: process.env.SMTP_FROM || "ERP Condominios <no-responder@localhost>",
      to: correo.para,
      subject: correo.asunto,
      text: correo.texto,
      html: correo.html,
      attachments: correo.adjuntos?.map((a) => ({ filename: a.nombre, content: a.contenido })),
    });
    if (!smtpConfigurado()) {
      await mkdir(CARPETA_SIMULADOS, { recursive: true });
      const nombre = `${new Date().toISOString().replace(/[:.]/g, "-")}-${correo.para.replace(/[^\w.@-]/g, "_")}.eml`;
      await writeFile(path.join(CARPETA_SIMULADOS, nombre), info.message as Buffer);
      return { estado: "SIMULADO" };
    }
    return { estado: "ENVIADO" };
  } catch (e) {
    return { estado: "ERROR", error: (e as Error).message.slice(0, 500) };
  }
}

export function escaparHtml(texto: string) {
  return texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
