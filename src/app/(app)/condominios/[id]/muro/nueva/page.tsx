import { Card, PageHeader } from "@/components/ui";
import { requireAdministradora } from "@/lib/auth";
import { crearPublicacion } from "../../../muro-actions";
import { PublicacionForm } from "../../../publicacion-form";
import { condominioVisible } from "../../condominio-actual";

export default async function NuevaPublicacionPage({ params }: PageProps<"/condominios/[id]/muro/nueva">) {
  const { id } = await params;
  await requireAdministradora();
  const { condominio } = await condominioVisible(id);
  return (
    <>
      <PageHeader titulo="Crear publicación" descripcion={condominio.nombre} />
      <Card>
        <PublicacionForm accion={crearPublicacion.bind(null, id)} textoBoton="Publicar" />
      </Card>
    </>
  );
}
