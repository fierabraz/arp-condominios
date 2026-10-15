import "server-only";
import { db } from "@/lib/db";
import type { UsuarioActual } from "@/lib/auth";

// Reglas de quién puede ver qué, para documentos que comparten administradores,
// comité y residentes (avisos de cobro y rendiciones).

export async function puedeVerCondominio(usuario: UsuarioActual, condominioId: string) {
  if (!usuario.administradoraId) return false;
  const condominio = await db.condominio.findFirst({
    where: { id: condominioId, administradoraId: usuario.administradoraId },
    select: { id: true },
  });
  if (!condominio) return false;
  switch (usuario.rol) {
    case "ADMINISTRADOR":
      return true;
    case "COMITE":
      return usuario.condominioId === condominioId;
    case "RESIDENTE":
      return (
        !!usuario.personaId &&
        (await db.unidadPersona.count({
          where: { personaId: usuario.personaId, unidad: { condominioId } },
        })) > 0
      );
    default:
      return false;
  }
}

export async function puedeVerUnidad(usuario: UsuarioActual, unidadId: string) {
  if (!usuario.administradoraId) return false;
  const unidad = await db.unidad.findFirst({
    where: { id: unidadId, administradoraId: usuario.administradoraId },
    select: { condominioId: true },
  });
  if (!unidad) return false;
  switch (usuario.rol) {
    case "ADMINISTRADOR":
      return true;
    case "COMITE":
      return usuario.condominioId === unidad.condominioId;
    case "RESIDENTE":
      return (
        !!usuario.personaId &&
        (await db.unidadPersona.count({ where: { personaId: usuario.personaId, unidadId } })) > 0
      );
    default:
      return false;
  }
}
