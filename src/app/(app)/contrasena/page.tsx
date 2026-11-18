import { Card, PageHeader } from "@/components/ui";
import { requireUsuario } from "@/lib/auth";
import { cambiarClave, guardarDatos } from "./actions";
import { ClaveForm } from "./clave-form";
import { DatosForm } from "./datos-form";

export default async function ContrasenaPage() {
  const usuario = await requireUsuario();
  return (
    <>
      <PageHeader titulo="Mi perfil" descripcion={usuario.correo} />
      <Card className="mb-6">
        <h2 className="mb-4 text-lg font-bold">Mis datos</h2>
        <DatosForm accion={guardarDatos} nombre={usuario.nombre} telefono={usuario.telefono ?? null} />
        <p className="mt-3 text-sm text-texto-suave">Tu correo es tu usuario. Para cambiarlo, escribe a Convive.</p>
      </Card>
      <Card>
        <h2 className="mb-4 text-lg font-bold">Cambiar contraseña</h2>
        <ClaveForm accion={cambiarClave} />
      </Card>
    </>
  );
}
