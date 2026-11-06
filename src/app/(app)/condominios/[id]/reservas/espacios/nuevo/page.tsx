import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { guardarEspacio } from "../../../../reservas-actions";
import { condominioVisible } from "../../../condominio-actual";
import { EspacioForm } from "../../espacio-form";

export default async function NuevoEspacioPage({ params }: PageProps<"/condominios/[id]/reservas/espacios/nuevo">) {
  const { id } = await params;
  const { condominio, editable } = await condominioVisible(id);
  if (!editable) notFound();
  return (
    <>
      <PageHeader titulo="Nuevo espacio para reservar" descripcion={`${condominio.nombre} · Quincho, sala de eventos, piscina u otro espacio común.`} />
      <Card>
        <EspacioForm accion={guardarEspacio.bind(null, id, null)} valores={{}} edicion={false} />
      </Card>
    </>
  );
}
