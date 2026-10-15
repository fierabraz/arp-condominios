import { getUsuarioActual } from "@/lib/auth";
import { db } from "@/lib/db";
import { puedeVerUnidad } from "@/lib/acceso";
import { datosAviso } from "@/lib/reportes";
import { pdfAviso } from "@/lib/documentos";
import { respuestaPdf } from "@/lib/pdf";

export async function GET(_: Request, { params }: RouteContext<"/avisos/[avisoId]/pdf">) {
  const { avisoId } = await params;
  const usuario = await getUsuarioActual();
  if (!usuario?.administradoraId) return new Response("No autorizado", { status: 401 });

  const aviso = await db.avisoCobro.findFirst({
    where: { id: avisoId, administradoraId: usuario.administradoraId },
    select: { unidadId: true },
  });
  if (!aviso || !(await puedeVerUnidad(usuario, aviso.unidadId))) {
    return new Response("No encontrado", { status: 404 });
  }

  const datos = (await datosAviso(avisoId, usuario.administradoraId))!;
  const { anio, mes } = datos.aviso.periodo;
  const nombre = `aviso-${anio}-${String(mes).padStart(2, "0")}-unidad-${datos.aviso.unidad.numero}.pdf`;
  return respuestaPdf(await pdfAviso(datos), nombre);
}
