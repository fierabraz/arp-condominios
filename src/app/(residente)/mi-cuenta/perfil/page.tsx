import Link from "next/link";
import { requirePermiso } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { cambiarClave } from "@/app/(app)/contrasena/actions";
import { ClaveForm } from "@/app/(app)/contrasena/clave-form";

export default async function PerfilResidentePage() {
  const usuario = await requirePermiso("portal.residente");
  return (
    <>
      <PageHeader titulo="Mi perfil" descripcion={`${usuario.nombre} · ${usuario.correo}`} />
      <Card>
        <h2 className="mb-4 text-lg font-bold">Cambiar contraseña</h2>
        <ClaveForm accion={cambiarClave} />
      </Card>
      <Card className="mt-4">
        <h2 className="mb-1 text-lg font-bold">Mis unidades</h2>
        <p className="mb-3 text-sm text-texto-suave">¿Tienes otra unidad en tu comunidad? Pide acceso con el código de la comunidad.</p>
        <Link href="/mi-cuenta/solicitudes" className="font-semibold text-marca hover:underline">
          Ver mis solicitudes o pedir acceso a otra unidad
        </Link>
      </Card>
      <p className="mt-4 text-sm text-texto-suave">
        Para cambiar tu nombre, correo o teléfono, pídelo a la administración de tu edificio.
      </p>
    </>
  );
}
