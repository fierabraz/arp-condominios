import { db } from "@/lib/db";
import { BotonLink, PageHeader, Vacio } from "@/components/ui";
import { TarjetaPublicacion } from "@/components/publicacion";
import { eliminarPublicacion } from "../../muro-actions";
import { condominioVisible } from "../condominio-actual";

export default async function MuroPage({ params }: PageProps<"/condominios/[id]/muro">) {
  const { id } = await params;
  const { condominio, editable } = await condominioVisible(id);
  const publicaciones = await db.publicacion.findMany({
    where: { condominioId: id },
    orderBy: { creadoEn: "desc" },
    include: { condominio: { select: { id: true, nombre: true } } },
  });
  return (
    <>
      <PageHeader
        titulo="Muro de la comunidad"
        descripcion={`${condominio.nombre} · Los residentes ven estas publicaciones en su cuenta.`}
        acciones={editable && <BotonLink href={`/condominios/${id}/muro/nueva`}>Crear publicación</BotonLink>}
      />
      {publicaciones.length === 0 ? (
        <Vacio>Aún no hay publicaciones.</Vacio>
      ) : (
        <div className="space-y-3">
          {publicaciones.map((p) => (
            <TarjetaPublicacion key={p.id} p={p} editable={editable} eliminar={eliminarPublicacion.bind(null, p.id)} />
          ))}
        </div>
      )}
    </>
  );
}
