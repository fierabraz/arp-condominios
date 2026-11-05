import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { condominioVisible } from "../../../condominio-actual";
import { guardarInstalacion } from "../../../../estructura-actions";
import { opcionesEstructura } from "../../datos";
import { InstalacionForm } from "../../formularios";

export default async function NuevaInstalacionPage({ params }: PageProps<"/condominios/[id]/estructura/instalaciones/nueva">) {
  const { id } = await params;
  const { condominio, administradoraId, editable } = await condominioVisible(id);
  if (!editable) notFound();
  const op = await opcionesEstructura(id, administradoraId);
  return (
    <>
      <nav aria-label="Ruta" className="mb-2 text-sm text-texto-suave">
        <Link href={`/condominios/${id}/estructura#instalaciones`} className="hover:text-marca">
          {condominio.nombre} › Estructura física
        </Link>
      </nav>
      <PageHeader titulo="Agregar instalación" />
      <Card className="max-w-3xl">
        <InstalacionForm
          accion={guardarInstalacion.bind(null, id, null)}
          agrupaciones={op.opcionesAgrupacion}
          proveedores={op.opcionesProveedor}
          textoBoton="Agregar"
        />
      </Card>
    </>
  );
}
