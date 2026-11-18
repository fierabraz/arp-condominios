import { requirePermiso } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { MisSolicitudes } from "./lista";

export default async function SolicitudesResidentePage() {
  const usuario = await requirePermiso("portal.residente");
  return (
    <>
      <PageHeader titulo="Mis unidades y solicitudes" descripcion="Pide acceso a tu unidad y revisa el estado de tus solicitudes." />
      <MisSolicitudes usuarioId={usuario.id} />
    </>
  );
}
