import { getUsuarioActual } from "@/lib/auth";
import { db } from "@/lib/db";
import { puedeVerUnidad } from "@/lib/acceso";
import { formatoFolioCertificado, type DatosCertificado } from "@/lib/certificados";
import { pdfCertificadoAlDia } from "@/lib/documento-cuenta";
import { respuestaPdf } from "@/lib/pdf";
import { origenDelSitio } from "@/lib/sitio";

// PILOTO-001 · Certificado de unidad al día ya emitido (solo se descarga; se emite desde la ficha).

export async function GET(_: Request, { params }: RouteContext<"/documentos/certificado/[certificadoId]">) {
  const { certificadoId } = await params;
  const usuario = await getUsuarioActual();
  if (!usuario?.administradoraId) return new Response("No autorizado", { status: 401 });
  const c = await db.certificadoAlDia.findFirst({ where: { id: certificadoId, administradoraId: usuario.administradoraId } });
  if (!c || !(await puedeVerUnidad(usuario, c.unidadId))) return new Response("No encontrado", { status: 404 });
  const pdf = await pdfCertificadoAlDia(c.datos as unknown as DatosCertificado, `${await origenDelSitio()}/verificar-certificado/${c.codigo}`);
  return respuestaPdf(pdf, `certificado-${formatoFolioCertificado(c.folio)}.pdf`);
}
