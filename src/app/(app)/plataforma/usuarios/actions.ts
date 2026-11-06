"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermiso, type UsuarioActual } from "@/lib/auth";
import { aTexto, erroresDe, type EstadoForm } from "@/lib/forms";
import { ETIQUETAS_ROL } from "@/lib/formato";
import { anotarIntento } from "@/lib/intentos";
import { registrar } from "@/lib/registro";
import { createSession } from "@/lib/session";
import { ClaveSchema, CorreoSchema } from "@/lib/usuarios";

// Administración de cuentas desde la plataforma: solo la cuenta SUPERADMIN.

async function cuenta(id: string) {
  const yo = await requirePermiso("plataforma");
  const u = await db.usuario.findUnique({ where: { id } });
  return { yo, u };
}

// El cambio queda en el registro de la administradora de la cuenta, para que su administrador lo vea.
const autorPara = (yo: UsuarioActual, administradoraId: string | null) => ({ ...yo, administradoraId });
const ruta = (id: string) => `/plataforma/usuarios/${id}`;

const DatosSchema = z
  .object({
    nombre: z.string({ error: "Ingresa el nombre." }).min(2, { error: "Ingresa el nombre." }),
    correo: CorreoSchema,
    rol: z.enum(["SUPERADMIN", "ADMINISTRADOR", "COMITE", "RESIDENTE"]),
    condominioId: z.string().optional(),
  })
  .refine((d) => d.rol !== "COMITE" || d.condominioId, { error: "Elige la propiedad que verá el comité.", path: ["condominioId"] });

export async function editarDatos(id: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const { yo, u } = await cuenta(id);
  if (!u) return { mensaje: "Cuenta no encontrada." };
  const datos = DatosSchema.safeParse({
    nombre: aTexto(formData.get("nombre")),
    correo: aTexto(formData.get("correo")),
    rol: aTexto(formData.get("rol")) ?? u.rol,
    condominioId: aTexto(formData.get("condominioId")),
  });
  if (!datos.success) return erroresDe(datos.error);
  const d = datos.data;

  // El rol solo cambia entre administrador y comité: una cuenta de residente depende de su persona
  // y la de plataforma no pertenece a ninguna administradora.
  const cambiaRol = d.rol !== u.rol;
  if (cambiaRol && !(["ADMINISTRADOR", "COMITE"].includes(u.rol) && ["ADMINISTRADOR", "COMITE"].includes(d.rol))) {
    return { errores: { rol: ["Este rol no se puede cambiar aquí."] } };
  }
  if (d.rol === "COMITE" && !(await db.condominio.findFirst({ where: { id: d.condominioId, administradoraId: u.administradoraId ?? "" } }))) {
    return { errores: { condominioId: ["Propiedad no encontrada."] } };
  }
  const repetido = await db.usuario.findFirst({ where: { correo: d.correo, NOT: { id } } });
  if (repetido) return { errores: { correo: ["Ese correo ya tiene otra cuenta."] } };

  await db.usuario.update({
    where: { id },
    data: {
      nombre: d.nombre,
      correo: d.correo,
      rol: d.rol,
      ...(["ADMINISTRADOR", "COMITE"].includes(d.rol) ? { condominioId: d.rol === "COMITE" ? d.condominioId : null } : {}),
    },
  });
  const cambios = [
    u.nombre !== d.nombre && `nombre: ${u.nombre} → ${d.nombre}`,
    u.correo !== d.correo && `correo: ${u.correo} → ${d.correo}`,
    cambiaRol && `rol: ${ETIQUETAS_ROL[u.rol]} → ${ETIQUETAS_ROL[d.rol]}`,
    !cambiaRol && d.rol === "COMITE" && u.condominioId !== d.condominioId && "propiedad del comité",
  ].filter(Boolean);
  if (cambios.length) await registrar(autorPara(yo, u.administradoraId), "Plataforma editó una cuenta", `${d.nombre}: ${cambios.join("; ")}`);
  revalidatePath("/plataforma/usuarios", "layout");
  return { ok: true, mensaje: cambios.length ? "Cambios guardados." : "No había cambios." };
}

const ClaveNuevaSchema = z
  .object({ nueva: ClaveSchema, repetir: z.string({ error: "Repite la contraseña." }) })
  .refine((d) => d.nueva === d.repetir, { error: "Las contraseñas no coinciden.", path: ["repetir"] });

export async function cambiarClaveDe(id: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const { yo, u } = await cuenta(id);
  if (!u) return { mensaje: "Cuenta no encontrada." };
  const datos = ClaveNuevaSchema.safeParse({ nueva: aTexto(formData.get("nueva")), repetir: aTexto(formData.get("repetir")) });
  if (!datos.success) return erroresDe(datos.error);
  // claveActualizadaEn cierra las sesiones abiertas de esa cuenta.
  await db.usuario.update({
    where: { id },
    data: { claveHash: await bcrypt.hash(datos.data.nueva, 10), claveActualizadaEn: new Date() },
  });
  if (u.id === yo.id) await createSession({ usuarioId: yo.id, rol: yo.rol, administradoraId: yo.administradoraId });
  await anotarIntento(u.correo, null, true); // también la desbloquea
  await registrar(autorPara(yo, u.administradoraId), "Plataforma cambió la contraseña de una cuenta", `${u.nombre} (${u.correo})`);
  revalidatePath(ruta(id));
  return { ok: true, mensaje: `Contraseña cambiada. Comunícasela a ${u.nombre.split(" ")[0]} por un medio seguro.` };
}

export async function cambiarEstado(id: string, activo: boolean) {
  const { yo, u } = await cuenta(id);
  if (!u || u.id === yo.id) return; // la cuenta de plataforma no se desactiva a sí misma
  await db.usuario.update({ where: { id }, data: { activo } });
  await registrar(
    autorPara(yo, u.administradoraId),
    activo ? "Plataforma activó una cuenta" : "Plataforma desactivó una cuenta",
    `${u.nombre} (${u.correo})`,
  );
  revalidatePath("/plataforma/usuarios", "layout");
}

export async function desbloquear(id: string) {
  const { yo, u } = await cuenta(id);
  if (!u) return;
  // Un intento correcto anotado reinicia la cuenta de fallos.
  await anotarIntento(u.correo, null, true);
  await registrar(autorPara(yo, u.administradoraId), "Plataforma desbloqueó el ingreso de una cuenta", `${u.nombre} (${u.correo})`);
  revalidatePath(ruta(id));
}
