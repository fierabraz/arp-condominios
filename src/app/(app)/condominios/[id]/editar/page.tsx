import { notFound } from "next/navigation";
import { puedeVerPropiedad, requireAdministradora } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { CondominioForm } from "../../condominio-form";
import { editarCondominio } from "../../actions";

export default async function EditarCondominioPage({ params, searchParams }: PageProps<"/condominios/[id]/editar">) {
  const { id } = await params;
  const { volver } = await searchParams;
  const { usuario, administradoraId } = await requireAdministradora();
  if (!puedeVerPropiedad(usuario, id)) notFound();
  const c = await db.condominio.findFirst({ where: { id, administradoraId } });
  if (!c) notFound();

  return (
    <>
      <PageHeader titulo="Datos de la propiedad" descripcion={c.nombre} />
      <Card>
        <CondominioForm
          accion={editarCondominio.bind(null, c.id)}
          textoBoton="Guardar cambios"
          volver={volver === "configuracion" ? "configuracion" : undefined}
          valores={{
            nombre: c.nombre,
            direccion: c.direccion,
            comuna: c.comuna,
            region: c.region,
            rut: c.rut,
            tipo: c.tipo,
            modalidad: c.modalidad,
            fechaIncorporacion: c.fechaIncorporacion?.toISOString().slice(0, 10) ?? null,
            reglamento: c.reglamento,
            observaciones: c.observaciones,
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
