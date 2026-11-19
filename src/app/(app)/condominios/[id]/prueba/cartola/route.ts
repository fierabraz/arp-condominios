import { notFound } from "next/navigation";
import { requireAdministradora, puedeVerPropiedad } from "@/lib/auth";
import { db } from "@/lib/db";
import { cartolaDemo, demoPermitida } from "@/lib/demo-financiera";

// FIN-COMP · Cartola FICTICIA para la comunidad de prueba (?n=1 sin la transferencia, ?n=2 con ella).

export async function GET(request: Request, ctx: RouteContext<"/condominios/[id]/prueba/cartola">) {
  const { id } = await ctx.params;
  const { usuario, administradoraId } = await requireAdministradora("banco.importar");
  if (!demoPermitida() || !puedeVerPropiedad(usuario, id)) notFound();
  const c = await db.condominio.findFirst({ where: { id, administradoraId, demo: true }, select: { id: true } });
  if (!c) notFound();
  const n = new URL(request.url).searchParams.get("n") === "2" ? 2 : 1;
  return new Response("﻿" + cartolaDemo(n), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cartola-ficticia-${n}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
