import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdministradora } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { editarPublicacion } from "../../../../muro-actions";
import { PublicacionForm } from "../../../../publicacion-form";

export default async function EditarPublicacionPage({
  params,
}: PageProps<"/condominios/[id]/muro/[publicacionId]/editar">) {
  const { id, publicacionId } = await params;
  const { administradoraId } = await requireAdministradora();
  const p = await db.publicacion.findFirst({ where: { id: publicacionId, condominioId: id, administradoraId } });
  if (!p) notFound();
  return (
    <>
      <PageHeader titulo="Editar publicación" />
      <Card>
        <PublicacionForm
          accion={editarPublicacion.bind(null, p.id)}
          valores={{ titulo: p.titulo, contenido: p.contenido }}
          textoBoton="Guardar cambios"
        />
      </Card>
    </>
  );
}
