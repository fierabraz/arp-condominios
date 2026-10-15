import { getUsuarioActual } from "@/lib/auth";
import { db } from "@/lib/db";
import { puedeVerCondominio } from "@/lib/acceso";
import { datosRendicion } from "@/lib/reportes";
import { pdfRendicion } from "@/lib/documentos";
import { respuestaPdf } from "@/lib/pdf";

export async function GET(_: Request, { params }: RouteContext<"/rendiciones/[periodoId]/pdf">) {
  const { periodoId } = await params;
  const usuario = await getUsuarioActual();
  if (!usuario?.administradoraId) return new Response("No autorizado", { status: 401 });

  const periodo = await db.periodo.findFirst({
    where: { id: periodoId, administradoraId: usuario.administradoraId },
    select: { condominioId: true, estado: true },
  });
  // Solo los períodos cerrados tienen rendición: antes de cerrar los gastos aún pueden cambiar.
  if (!periodo || periodo.estado !== "CERRADO" || !(await puedeVerCondominio(usuario, periodo.condominioId))) {
    return new Response("No encontrado", { status: 404 });
  }

  const datos = (await datosRendicion(periodoId, usuario.administradoraId))!;
  const { anio, mes, condominio } = datos.periodo;
  const slug = condominio.nombre.normalize("NFD").replace(/[^\w]+/g, "-").toLowerCase();
  return respuestaPdf(await pdfRendicion(datos), `rendicion-${anio}-${String(mes).padStart(2, "0")}-${slug}.pdf`);
}
