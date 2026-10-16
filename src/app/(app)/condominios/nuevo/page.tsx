import { requireAdministradora } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { CondominioForm } from "../condominio-form";
import { crearCondominio } from "../actions";

export default async function NuevoCondominioPage() {
  await requireAdministradora();
  return (
    <>
      <PageHeader titulo="Crear propiedad" descripcion="Un edificio o condominio con sus reglas de cobro" />
      <Card>
        <CondominioForm accion={crearCondominio} textoBoton="Crear condominio" />
      </Card>
    </>
  );
}
