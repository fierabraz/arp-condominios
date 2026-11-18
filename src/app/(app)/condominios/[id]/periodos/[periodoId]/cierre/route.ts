import { getUsuarioActual } from "@/lib/auth";
import { db } from "@/lib/db";
import { puedeVerCondominio } from "@/lib/acceso";
import { pdfInformeCierre } from "@/lib/documento-cierre";
import type { ResumenCierre } from "@/lib/cierre-servicio";
import { respuestaPdf } from "@/lib/pdf";

// FIN-COMP · Entrega C · Informe de cierre del mes (PDF), con el resumen fijo guardado al cerrar.

export async function GET(_: Request, { params }: RouteContext<"/condominios/[id]/periodos/[periodoId]/cierre">) {
  const { id, periodoId } = await params;
  const usuario = await getUsuarioActual();
  if (!usuario?.administradoraId) return new Response("No autorizado", { status: 401 });
  const p = await db.periodo.findFirst({
    where: { id: periodoId, condominioId: id, administradoraId: usuario.administradoraId },
    select: { anio: true, mes: true, condominioId: true, mesCerradoEn: true, resumenCierre: true, reabiertoEn: true, reabiertoPor: true, motivoReapertura: true },
  });
  if (!p || !p.mesCerradoEn || !p.resumenCierre || !(await puedeVerCondominio(usuario, p.condominioId))) {
    return new Response("No encontrado", { status: 404 });
  }
  const reapertura = p.reabiertoEn ? { en: p.reabiertoEn, por: p.reabiertoPor, motivo: p.motivoReapertura } : null;
  const pdf = await pdfInformeCierre(p.resumenCierre as unknown as ResumenCierre, usuario.administradora?.moneda ?? "CLP", reapertura);
  return respuestaPdf(pdf, `informe-cierre-${p.anio}-${String(p.mes).padStart(2, "0")}.pdf`);
}
