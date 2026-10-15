import { requireAdministradora } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { CondominioForm } from "../condominio-form";
import { crearCondominio } from "../actions";

export default async function NuevoCondominioPage() {
  await requireAdministradora();
  return (
    <>
      <PageHeader titulo="Nuevo condominio" />
      <Card>
        <CondominioForm accion={crearCondominio} textoBoton="Crear condominio" />
      </Card>
    </>
  );
}
