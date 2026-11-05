"use server";

import { requireUsuario } from "@/lib/auth";
import { enviarCorreo, escaparHtml, proveedorActivo } from "@/lib/correo";
import { NOMBRE_PROVEEDOR } from "@/lib/correo-proveedores";
import { aTexto, erroresDe, type EstadoForm } from "@/lib/forms";
import { MARCA } from "@/lib/marca";
import { CorreoSchema } from "@/lib/usuarios";
import { z } from "zod";

export async function enviarCorreoPrueba(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const usuario = await requireUsuario(["SUPERADMIN"]);
  const datos = z.object({ para: CorreoSchema }).safeParse({ para: aTexto(formData.get("para")) });
  if (!datos.success) return erroresDe(datos.error);
  const proveedor = NOMBRE_PROVEEDOR[proveedorActivo()];
  const texto = `Hola, ${usuario.nombre.split(" ")[0]}:\n\nEste es un correo de prueba de ${MARCA.nombre}, enviado con ${proveedor}. Si te llegó, los avisos de cobro, las invitaciones y la recuperación de contraseña también van a llegar.`;
  const r = await enviarCorreo({
    para: datos.data.para,
    asunto: `Prueba de correo de ${MARCA.nombre}`,
    texto,
    html: texto.split("\n\n").map((l) => `<p>${escaparHtml(l)}</p>`).join(""),
  });
  if (r.estado === "ENVIADO") {
    return { ok: true, mensaje: `Listo: ${proveedor} aceptó el correo. Revisa la bandeja de ${datos.data.para} (y la carpeta de spam).` };
  }
  if (r.estado === "SIMULADO") {
    return { mensaje: "No hay un servicio de correo configurado, así que el correo no salió (modo de prueba)." };
  }
  return { mensaje: `No se pudo enviar. ${r.error ?? ""}` };
}
