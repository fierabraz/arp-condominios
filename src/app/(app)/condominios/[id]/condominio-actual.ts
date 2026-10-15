import "server-only";
import { notFound } from "next/navigation";
import { requireAdministradora, puedeEditar } from "@/lib/auth";
import { db } from "@/lib/db";

/** Carga el condominio si el usuario puede verlo (administrador o comité de ese condominio). */
export async function condominioVisible(id: string) {
  const { usuario, administradoraId } = await requireAdministradora(["ADMINISTRADOR", "COMITE"]);
  if (usuario.rol === "COMITE" && usuario.condominioId !== id) notFound();
  const condominio = await db.condominio.findFirst({ where: { id, administradoraId } });
  if (!condominio) notFound();
  return {
    usuario,
    administradoraId,
    condominio,
    editable: puedeEditar(usuario.rol),
    moneda: usuario.administradora?.moneda ?? "CLP",
  };
}
