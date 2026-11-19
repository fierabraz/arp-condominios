import { getUsuarioActual } from "@/lib/auth";
import { db } from "@/lib/db";
import { puedeVerUnidad } from "@/lib/acceso";
import { puede } from "@/lib/permisos";

// PAG-001 · Comprobante de una transferencia informada. Lo ven el residente de esa unidad y la
// administración con permiso para verificar pagos en esa comunidad (el comité no).

export async function GET(_: Request, { params }: RouteContext<"/comprobantes/[transferenciaId]">) {
  const { transferenciaId } = await params;
  const usuario = await getUsuarioActual();
  if (!usuario?.administradoraId) return new Response("No autorizado", { status: 401 });
  const t = await db.transferenciaInformada.findFirst({
    where: { id: transferenciaId, administradoraId: usuario.administradoraId },
    select: { unidadId: true, condominioId: true, comprobante: { select: { nombre: true, tipo: true, datos: true } } },
  });
  const permitido =
    t &&
    (usuario.rol === "RESIDENTE" ? await puedeVerUnidad(usuario, t.unidadId) : puede(usuario, "pagos.verificar", t.condominioId));
  if (!t?.comprobante || !permitido) return new Response("No encontrado", { status: 404 });
  const nombre = t.comprobante.nombre.replace(/[^\w.\- ]/g, "_");
  return new Response(new Uint8Array(t.comprobante.datos), {
    headers: {
      "Content-Type": t.comprobante.tipo,
      "Content-Disposition": `inline; filename="${nombre}"`,
      "Cache-Control": "private, no-store",
      // El tipo se comprobó por el contenido al subirlo (PDF o imagen) y no se deja adivinar otro.
      "X-Content-Type-Options": "nosniff",
    },
  });
}
