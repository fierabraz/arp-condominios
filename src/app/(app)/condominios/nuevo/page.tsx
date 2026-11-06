import { requireAdministradora } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { CondominioForm } from "../condominio-form";
import { crearCondominio } from "../actions";

export default async function NuevoCondominioPage() {
  await requireAdministradora("propiedades.crear");
  return (
    <>
      <PageHeader
        titulo="Crear propiedad"
        descripcion="Queda “En configuración” hasta que completes sus datos. Puedes guardar a medias y continuar después."
      />
      <Card>
        <CondominioForm accion={crearCondominio} textoBoton="Guardar y continuar" />
      </Card>
    </>
  );
}
