import "server-only";
import type { UsuarioActual } from "@/lib/auth";
import { asistenteDisponible } from "@/lib/asistente/servicio";
import { Asistente } from "./asistente";

/** IA-002 · Muestra el botón "Ayuda" solo si el asistente está configurado y la cuenta puede usarlo. */
export function AsistenteFlotante({ usuario }: { usuario: UsuarioActual }) {
  if (!asistenteDisponible(usuario)) return null;
  if (usuario.rol !== "ADMINISTRADOR" && usuario.rol !== "COMITE" && usuario.rol !== "RESIDENTE") return null;
  return <Asistente perfil={usuario.rol} nombre={usuario.nombre} />;
}
