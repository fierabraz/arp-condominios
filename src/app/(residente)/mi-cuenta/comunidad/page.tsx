import { requirePermiso } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, Vacio } from "@/components/ui";
import { TarjetaPublicacion } from "@/components/publicacion";
import { unidadesVisibles } from "../../datos-residente";

export default async function ComunidadPage({ searchParams }: PageProps<"/mi-cuenta/comunidad">) {
  const usuario = await requirePermiso("portal.residente");
  const { condominioIds } = await unidadesVisibles(usuario, (await searchParams).unidad);
  const publicaciones = await db.publicacion.findMany({
    where: { condominioId: { in: condominioIds } },
    orderBy: { creadoEn: "desc" },
    take: 30,
    include: { condominio: { select: { id: true, nombre: true } } },
  });
  return (
    <>
      <PageHeader titulo="Noticias y comunicados" descripcion="Avisos que publica la administración de tu comunidad." />
      {publicaciones.length === 0 ? (
        <Vacio>La administración aún no ha publicado avisos.</Vacio>
      ) : (
        <div className="space-y-3">
          {publicaciones.map((p) => (
            <TarjetaPublicacion key={p.id} p={p} editable={false} completa />
          ))}
        </div>
      )}
    </>
  );
}
