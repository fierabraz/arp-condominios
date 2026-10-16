import { Card, PageHeader } from "@/components/ui";
import { requireAdministradora } from "@/lib/auth";
import { hoyChile } from "@/lib/formato";
import { crearVotacion } from "../../../votaciones-actions";
import { VotacionForm } from "../../../votacion-form";
import { condominioVisible } from "../../condominio-actual";

export default async function NuevaVotacionPage({ params }: PageProps<"/condominios/[id]/votaciones/nueva">) {
  const { id } = await params;
  await requireAdministradora();
  const { condominio } = await condominioVisible(id);
  const hoy = hoyChile();
  const enUnaSemana = new Date(Date.parse(hoy) + 7 * 86_400_000).toISOString().slice(0, 10);
  return (
    <>
      <PageHeader titulo="Nueva votación" descripcion={condominio.nombre} />
      <Card>
        <VotacionForm accion={crearVotacion.bind(null, id)} fechaMinima={hoy} fechaSugerida={enUnaSemana} />
      </Card>
    </>
  );
}
