import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { condominioVisible } from "../../../condominio-actual";
import { guardarEspacio } from "../../../../estructura-actions";
import { opcionesEstructura } from "../../datos";
import { EspacioForm } from "../../formularios";

export default async function NuevoEspacioPage({ params, searchParams }: PageProps<"/condominios/[id]/estructura/espacios/nuevo">) {
  const { id } = await params;
  const { clase } = await searchParams;
  const { condominio, administradoraId, editable } = await condominioVisible(id);
  if (!editable) notFound();
  const op = await opcionesEstructura(id, administradoraId);
  return (
    <>
      <nav aria-label="Ruta" className="mb-2 text-sm text-texto-suave">
        <Link href={`/condominios/${id}/estructura`} className="hover:text-marca">
          {condominio.nombre} › Estructura física
        </Link>
      </nav>
      <PageHeader titulo="Agregar estacionamiento o bodega" />
      <Card className="max-w-3xl">
        <EspacioForm
          accion={guardarEspacio.bind(null, id, null)}
          valores={{ clase: clase === "BODEGA" ? "BODEGA" : "ESTACIONAMIENTO" }}
          agrupaciones={op.opcionesAgrupacion}
          unidades={op.opcionesUnidad}
          textoBoton="Agregar"
        />
      </Card>
    </>
  );
}
