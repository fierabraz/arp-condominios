"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePrincipal } from "@/lib/auth";
import { invitarEquipo, renovarInvitacionEquipo, type PerfilEquipo, type ResultadoInvitacionEquipo } from "@/lib/cuentas";
import { aTexto, erroresDe, type EstadoForm } from "@/lib/forms";
import { esPermisoAsignable } from "@/lib/permisos";
import { registrar } from "@/lib/registro";
import { CorreoSchema } from "@/lib/usuarios";

// PILOTO-001: el equipo de la administración se suma por invitación (cada persona crea su propia
// contraseña con el enlace que le llega). Nadie escribe ni comparte la contraseña de otro.

const PERFILES = ["PRINCIPAL", "ADMINISTRADOR", "SUBADMINISTRADOR", "ASISTENTE", "CONSERJE", "PERSONAL", "COMITE"] as const;

const InvitarSchema = z.object({
  nombre: z.string({ error: "Ingresa el nombre." }).min(2, { error: "Ingresa el nombre." }).max(120),
  correo: CorreoSchema,
  perfil: z.enum(PERFILES, { error: "Elige un perfil." }),
});

const listas = (f: FormData) => ({
  asignados: [...new Set(f.getAll("asignados").map(String).filter(Boolean))],
  permisosExtra: [...new Set(f.getAll("permisosExtra").map(String).filter(esPermisoAsignable))],
});

export type EstadoInvitacion = EstadoForm & { invitacion?: Extract<ResultadoInvitacionEquipo, { ok: true }> };

export async function invitarMiembro(_: EstadoInvitacion, formData: FormData): Promise<EstadoInvitacion> {
  const { usuario, administradoraId } = await requirePrincipal();
  const datos = InvitarSchema.safeParse({
    nombre: aTexto(formData.get("nombre")),
    correo: aTexto(formData.get("correo")),
    perfil: aTexto(formData.get("perfil")),
  });
  if (!datos.success) return erroresDe(datos.error);
  const { asignados, permisosExtra } = listas(formData);
  const r = await invitarEquipo(usuario, administradoraId, {
    ...datos.data,
    perfil: datos.data.perfil as PerfilEquipo,
    condominioIds: asignados,
    permisosExtra,
  });
  if (!r.ok) return { errores: r.errores, mensaje: r.mensaje };
  revalidatePath("/usuarios");
  return { ok: true, invitacion: r };
}

export async function renovarInvitacion(usuarioId: string): Promise<string | null> {
  const { usuario, administradoraId } = await requirePrincipal();
  const enlace = await renovarInvitacionEquipo(usuario, administradoraId, usuarioId);
  revalidatePath("/usuarios");
  return enlace;
}

export async function eliminarUsuario(id: string) {
  const { usuario, administradoraId } = await requirePrincipal();
  if (id === usuario.id) return; // no borrarse a sí mismo
  const borrado = await db.usuario.findFirst({
    where: { id, administradoraId, rol: { in: ["ADMINISTRADOR", "COMITE"] } },
    select: { nombre: true, correo: true },
  });
  if (!borrado) return;
  await db.usuario.deleteMany({ where: { id, administradoraId } });
  await registrar(usuario, "Borró una cuenta de acceso", `${borrado.nombre} (${borrado.correo})`);
  revalidatePath("/usuarios");
}

/**
 * Cambia el perfil de alguien del equipo, sus comunidades y sus permisos adicionales. Siempre
 * debe quedar al menos un administrador principal, y nadie se quita a sí mismo el ser principal.
 */
export async function guardarPerfil(usuarioId: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const { usuario, administradoraId } = await requirePrincipal();
  const perfil = z.enum(PERFILES).safeParse(aTexto(formData.get("perfil")));
  if (!perfil.success) return { mensaje: "Elige un perfil." };
  const p = perfil.data;
  const cuenta = await db.usuario.findFirst({
    where: { id: usuarioId, administradoraId, rol: { in: ["ADMINISTRADOR", "COMITE"] } },
    select: { id: true, nombre: true, rol: true, accesoTodas: true, cargo: true },
  });
  if (!cuenta) return { mensaje: "Cuenta no encontrada." };
  if (cuenta.id === usuario.id && p !== "PRINCIPAL") {
    return { mensaje: "No puedes quitarte a ti mismo el perfil de principal. Pídeselo a otro administrador principal." };
  }
  const { asignados, permisosExtra } = listas(formData);
  const ids =
    p === "PRINCIPAL"
      ? []
      : (await db.condominio.findMany({ where: { administradoraId, id: { in: asignados } }, select: { id: true } })).map((c) => c.id);
  if (p === "COMITE" && ids.length !== 1) return { mensaje: "El comité ve una sola comunidad: elige una." };
  if (p !== "PRINCIPAL" && p !== "COMITE" && ids.length === 0) return { mensaje: "Elige al menos una comunidad." };

  const eraPrincipal = cuenta.rol === "ADMINISTRADOR" && cuenta.accesoTodas && !cuenta.cargo;
  if (eraPrincipal && p !== "PRINCIPAL") {
    const otros = await db.usuario.count({
      where: { administradoraId, rol: "ADMINISTRADOR", accesoTodas: true, cargo: null, activo: true, id: { not: cuenta.id } },
    });
    if (otros === 0) return { mensaje: "Debe quedar al menos un administrador principal." };
  }
  const cargo = p === "PRINCIPAL" || p === "ADMINISTRADOR" || p === "COMITE" ? null : p;
  await db.$transaction([
    db.usuario.update({
      where: { id: cuenta.id },
      data: {
        rol: p === "COMITE" ? "COMITE" : "ADMINISTRADOR",
        accesoTodas: p === "PRINCIPAL",
        cargo,
        permisosExtra: p === "ASISTENTE" ? permisosExtra : [],
        condominioId: p === "COMITE" ? ids[0] : null,
      },
    }),
    db.asignacionCondominio.deleteMany({ where: { usuarioId: cuenta.id } }),
    ...(p !== "PRINCIPAL" && p !== "COMITE"
      ? [db.asignacionCondominio.createMany({ data: ids.map((id) => ({ usuarioId: cuenta.id, condominioId: id })) })]
      : []),
  ]);
  await registrar(
    usuario,
    "Cambió el perfil de una persona del equipo",
    `${cuenta.nombre}: ${p.toLowerCase()}${ids.length ? `, ${ids.length} comunidad(es)` : ""}${p === "ASISTENTE" && permisosExtra.length ? `, permisos: ${permisosExtra.join(", ")}` : ""}`,
  );
  revalidatePath("/usuarios");
  return { ok: true, mensaje: "Perfil guardado." };
}
