import { getUsuarioActual } from "@/lib/auth";
import { db } from "@/lib/db";
import { puede } from "@/lib/permisos";

// FIN-COMP B · Archivo de respaldo de un egreso. Lo ve la administración o el comité de la comunidad.

export async function GET(_: Request, { params }: RouteContext<"/condominios/[id]/egresos/[gastoId]/respaldos/[respaldoId]">) {
  const { id, gastoId, respaldoId } = await params;
  const usuario = await getUsuarioActual();
  if (!usuario?.administradoraId || !puede(usuario, "propiedad.ver", id)) return new Response("No encontrado", { status: 404 });
  const r = await db.respaldoGasto.findFirst({
    where: { id: respaldoId, gastoId, gasto: { administradoraId: usuario.administradoraId, periodo: { condominioId: id } } },
    select: { nombre: true, tipo: true, datos: true },
  });
  if (!r) return new Response("No encontrado", { status: 404 });
  return new Response(new Uint8Array(r.datos), {
    headers: {
      "Content-Type": r.tipo,
      "Content-Disposition": `inline; filename="${r.nombre.replace(/[^\w.\- ]/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
