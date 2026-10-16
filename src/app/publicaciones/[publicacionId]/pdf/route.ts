import { getUsuarioActual } from "@/lib/auth";
import { db } from "@/lib/db";
import { puedeVerCondominio } from "@/lib/acceso";
import { encabezado, generarPdf, respuestaPdf, COLOR } from "@/lib/pdf";

export async function GET(_: Request, { params }: RouteContext<"/publicaciones/[publicacionId]/pdf">) {
  const { publicacionId } = await params;
  const usuario = await getUsuarioActual();
  if (!usuario?.administradoraId) return new Response("No autorizado", { status: 401 });
  const p = await db.publicacion.findFirst({
    where: { id: publicacionId, administradoraId: usuario.administradoraId },
    include: { condominio: { select: { nombre: true } } },
  });
  if (!p || !(await puedeVerCondominio(usuario, p.condominioId))) return new Response("No encontrado", { status: 404 });

  const fecha = new Intl.DateTimeFormat("es-CL", { dateStyle: "long", timeZone: "America/Santiago" }).format(p.creadoEn);
  const pdf = await generarPdf(p.titulo, (doc) => {
    encabezado(doc, { arriba: p.condominio.nombre, titulo: p.titulo, abajo: `${fecha} · ${p.autor}` });
    doc.font("Helvetica").fontSize(11).fillColor(COLOR.texto).text(p.contenido, { lineGap: 3 });
  });
  const slug = p.titulo.normalize("NFD").replace(/[^\w]+/g, "-").toLowerCase().slice(0, 60);
  return respuestaPdf(pdf, `publicacion-${slug}.pdf`);
}
