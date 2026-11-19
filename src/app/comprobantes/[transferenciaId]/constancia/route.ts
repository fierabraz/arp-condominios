import { getUsuarioActual } from "@/lib/auth";
import { db } from "@/lib/db";
import { puedeVerUnidad } from "@/lib/acceso";
import { puede } from "@/lib/permisos";
import { constanciaDeTransferencia } from "@/lib/constancias-servicio";
import { formatoFolio, type DatosConstancia } from "@/lib/constancias";
import { pdfConstancia } from "@/lib/documento-constancia";
import { origenDelSitio } from "@/lib/sitio";
import { respuestaPdf } from "@/lib/pdf";

// PILOTO-001 · Constancia de pago (PDF) de una transferencia informada. `?v=N` pide una versión
// anterior; sin `v`, la vigente. La ven el residente de la unidad y la administración que verifica
// pagos en esa comunidad (los mismos permisos que el comprobante subido).

export async function GET(request: Request, { params }: RouteContext<"/comprobantes/[transferenciaId]/constancia">) {
  const { transferenciaId } = await params;
  const usuario = await getUsuarioActual();
  if (!usuario?.administradoraId) return new Response("No autorizado", { status: 401 });
  const t = await db.transferenciaInformada.findFirst({
    where: { id: transferenciaId, administradoraId: usuario.administradoraId },
    select: { unidadId: true, condominioId: true },
  });
  const permitido =
    t && (usuario.rol === "RESIDENTE" ? await puedeVerUnidad(usuario, t.unidadId) : puede(usuario, "pagos.verificar", t.condominioId));
  if (!t || !permitido) return new Response("No encontrado", { status: 404 });

  const c = await constanciaDeTransferencia(transferenciaId, usuario.nombre);
  const pedida = Number(new URL(request.url).searchParams.get("v"));
  const vigente = c.versiones.at(-1)!;
  const v = Number.isInteger(pedida) && pedida > 0 ? c.versiones.find((x) => x.version === pedida) : vigente;
  if (!v) return new Response("No encontrado", { status: 404 });
  const enlace = `${await origenDelSitio()}/verificar-pago/${c.codigo}`;
  const pdf = await pdfConstancia(v.datos as unknown as DatosConstancia, v.huella, enlace, v.version === vigente.version);
  return respuestaPdf(pdf, `constancia-${formatoFolio(c.folio)}-v${v.version}.pdf`);
}
