import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { TarjetaPublicacion } from "@/components/publicacion";
import { eliminarPublicacion } from "../../../muro-actions";
import { condominioVisible } from "../../condominio-actual";

export default async function PublicacionPage({ params }: PageProps<"/condominios/[id]/muro/[publicacionId]">) {
  const { id, publicacionId } = await params;
  const { editable } = await condominioVisible(id);
  const p = await db.publicacion.findFirst({
    where: { id: publicacionId, condominioId: id },
    include: { condominio: { select: { id: true, nombre: true } } },
  });
  if (!p) notFound();
  return (
    <>
      <Link href={`/condominios/${id}/muro`} className="mb-4 inline-block text-sm text-blue-700 hover:underline">
        ← Todas las publicaciones
      </Link>
      <TarjetaPublicacion p={p} editable={editable} completa eliminar={eliminarPublicacion.bind(null, p.id, true)} />
    </>
  );
}
