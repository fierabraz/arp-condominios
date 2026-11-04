import { requireUsuario } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { cambiarClave } from "@/app/(app)/contrasena/actions";
import { ClaveForm } from "@/app/(app)/contrasena/clave-form";

export default async function PerfilResidentePage() {
  const usuario = await requireUsuario(["RESIDENTE"]);
  return (
    <>
      <PageHeader titulo="Mi perfil" descripcion={`${usuario.nombre} · ${usuario.correo}`} />
      <Card>
        <h2 className="mb-4 text-lg font-bold">Cambiar contraseña</h2>
        <ClaveForm accion={cambiarClave} />
      </Card>
      <p className="mt-4 text-sm text-texto-suave">
        Para cambiar tu nombre, correo o teléfono, pídelo a la administración de tu edificio.
      </p>
    </>
  );
}
