"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { aTexto, erroresDe, type EstadoForm } from "@/lib/forms";
import { anotarIntento, ipCliente } from "@/lib/intentos";
import { canjearToken } from "@/lib/recuperacion";
import { registrar } from "@/lib/registro";
import { createSession } from "@/lib/session";
import { ClaveNuevaSchema } from "@/lib/usuarios";

/** El residente invitado crea su contraseña y entra directo a su cuenta. */
export async function aceptarInvitacion(token: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const datos = ClaveNuevaSchema.safeParse({ nueva: aTexto(formData.get("nueva")), repetir: aTexto(formData.get("repetir")) });
  if (!datos.success) return erroresDe(datos.error);
  const usuario = await canjearToken(token, "INVITACION", datos.data.nueva);
  if (!usuario) return { mensaje: "Esta invitación ya se usó o venció. Pide una nueva a la administración." };

  await anotarIntento(usuario.correo, await ipCliente(), true);
  await db.usuario.update({ where: { id: usuario.id }, data: { ultimoIngresoEn: new Date() } });
  await registrar(usuario, "Aceptó la invitación y creó su contraseña", usuario.correo);
  await createSession({ usuarioId: usuario.id, rol: usuario.rol, administradoraId: usuario.administradoraId });
  redirect("/mi-cuenta");
}
