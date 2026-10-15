import { Card, PageHeader } from "@/components/ui";
import { requireUsuario } from "@/lib/auth";
import { cambiarClave } from "./actions";
import { ClaveForm } from "./clave-form";

export default async function ContrasenaPage() {
  const usuario = await requireUsuario();
  return (
    <>
      <PageHeader titulo="Cambiar contraseña" descripcion={usuario.correo} />
      <Card>
        <ClaveForm accion={cambiarClave} />
      </Card>
    </>
  );
}
