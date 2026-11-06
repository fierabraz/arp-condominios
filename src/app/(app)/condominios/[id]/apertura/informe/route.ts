// COM-001 · Entrega 6: informe de apertura en PDF (03.07.11, T-81). Se genera al pedirlo y no se
// guarda: el archivo documental (ARC-001) todavía no existe. Solo administradores de la propiedad.
import { getUsuarioActual, puedeEditar, puedeVerPropiedad } from "@/lib/auth";
import { datosInformeApertura } from "@/lib/apertura-servicio";
import { pdfInformeApertura } from "@/lib/documentos";
import { informeApertura } from "@/lib/informe-apertura";
import { respuestaPdf } from "@/lib/pdf";
import { registrar } from "@/lib/registro";

export async function GET(_: Request, { params }: RouteContext<"/condominios/[id]/apertura/informe">) {
  const { id } = await params;
  const usuario = await getUsuarioActual();
  if (!usuario?.administradoraId) return new Response("No autorizado", { status: 401 });
  // El comité no lo descarga mientras no se decida qué ve (D-COM-09).
  if (!puedeEditar(usuario.rol) || !puedeVerPropiedad(usuario, id)) return new Response("No encontrado", { status: 404 });

  const datos = await datosInformeApertura(id, usuario.administradoraId, usuario.nombre);
  if (!datos || datos.comunidad.modalidad !== "EXISTENTE") return new Response("No encontrado", { status: 404 });

  const archivo = await pdfInformeApertura(informeApertura(datos));
  await registrar(usuario, "Informe de apertura", `Descargó el informe de apertura (borrador, corte ${datos.apertura.fechaCorte.toISOString().slice(0, 10)}).`, id);
  const slug = datos.comunidad.nombre.normalize("NFD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  return respuestaPdf(archivo, `informe-apertura-${slug}.pdf`);
}
