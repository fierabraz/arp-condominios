import { getUsuarioActual } from "@/lib/auth";
import { db } from "@/lib/db";
import { puedeVerUnidad } from "@/lib/acceso";
import { estadoCuenta } from "@/lib/cobro-servicio";
import { pdfEstadoCuenta } from "@/lib/documento-cuenta";
import { respuestaPdf } from "@/lib/pdf";

// PILOTO-001 · Estado de cuenta de una unidad en PDF. Lo ven el residente de la unidad y la
// administración o comité con acceso a la comunidad (igual que la pantalla).

export async function GET(_: Request, { params }: RouteContext<"/documentos/estado-cuenta/[unidadId]">) {
  const { unidadId } = await params;
  const usuario = await getUsuarioActual();
  if (!usuario?.administradoraId) return new Response("No autorizado", { status: 401 });
  if (!(await puedeVerUnidad(usuario, unidadId))) return new Response("No encontrado", { status: 404 });
  const [unidad, estado] = await Promise.all([
    db.unidad.findFirst({
      where: { id: unidadId, administradoraId: usuario.administradoraId },
      select: { numero: true, condominio: { select: { nombre: true, direccion: true, comuna: true } } },
    }),
    estadoCuenta(unidadId, usuario.administradoraId),
  ]);
  if (!unidad || !estado) return new Response("No encontrado", { status: 404 });
  const ahora = new Date();
  const pdf = await pdfEstadoCuenta(
    estado,
    {
      comunidad: unidad.condominio.nombre,
      direccion: [unidad.condominio.direccion, unidad.condominio.comuna].filter(Boolean).join(", "),
      unidad: unidad.numero,
      moneda: usuario.administradora?.moneda ?? "CLP",
      emitidoPor: usuario.rol === "RESIDENTE" ? "el portal del residente" : usuario.nombre,
    },
    ahora,
  );
  return respuestaPdf(pdf, `estado-de-cuenta-unidad-${unidad.numero.replace(/[^\w-]/g, "_")}-${ahora.toISOString().slice(0, 10)}.pdf`);
}
