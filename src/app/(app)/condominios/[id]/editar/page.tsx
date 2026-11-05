import { notFound } from "next/navigation";
import { puedeVerPropiedad, requireAdministradora } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { CondominioForm } from "../../condominio-form";
import { editarCondominio } from "../../actions";

export default async function EditarCondominioPage({ params }: PageProps<"/condominios/[id]/editar">) {
  const { id } = await params;
  const { usuario, administradoraId } = await requireAdministradora();
  if (!puedeVerPropiedad(usuario, id)) notFound();
  const c = await db.condominio.findFirst({ where: { id, administradoraId } });
  if (!c) notFound();

  return (
    <>
      <PageHeader titulo="Configurar propiedad" descripcion={c.nombre} />
      <Card>
        <CondominioForm
          accion={editarCondominio.bind(null, c.id)}
          textoBoton="Guardar cambios"
          valores={{
            nombre: c.nombre,
            direccion: c.direccion,
            comuna: c.comuna,
            rut: c.rut,
            porcentajeReserva: c.porcentajeReserva.toString(),
            tasaInteresMora: c.tasaInteresMora.toString(),
            diaVencimiento: c.diaVencimiento,
            totalUnidades: c.totalUnidades,
          }}
        />
      </Card>
    </>
  );
}
