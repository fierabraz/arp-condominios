import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { BotonConfirmar } from "@/components/boton-confirmar";
import { eliminarEspacio, guardarEspacio } from "../../../../reservas-actions";
import { condominioVisible } from "../../../condominio-actual";
import { EspacioForm } from "../../espacio-form";

export default async function EditarEspacioPage({ params }: PageProps<"/condominios/[id]/reservas/espacios/[espacioId]">) {
  const { id, espacioId } = await params;
  const { condominio, editable } = await condominioVisible(id);
  if (!editable) notFound();
  const e = await db.espacioReservable.findFirst({
    where: { id: espacioId, condominioId: id },
    include: { _count: { select: { reservas: true } } },
  });
  if (!e) notFound();
  return (
    <>
      <PageHeader titulo={`Editar ${e.nombre}`} descripcion={`${condominio.nombre} · Los cambios de costo y reglas valen para las reservas nuevas; las ya hechas se mantienen.`} />
      <Card>
        <EspacioForm
          accion={guardarEspacio.bind(null, id, e.id)}
          edicion
          valores={{
            nombre: e.nombre,
            descripcion: e.descripcion ?? "",
            normas: e.normas ?? "",
            capacidad: e.capacidad?.toString() ?? "",
            turnos: e.turnos.join("\n"),
            costo: Number(e.costo).toString(),
            requiereAprobacion: e.requiereAprobacion,
            anticipacionMaximaDias: e.anticipacionMaximaDias.toString(),
            maximoPorMes: e.maximoPorMes?.toString() ?? "",
            bloquearMorosos: e.bloquearMorosos,
            activo: e.activo,
          }}
        />
      </Card>
      <div className="mt-6 text-sm text-texto-suave">
        {e._count.reservas > 0 ? (
          <p>Este espacio tiene {e._count.reservas} reservas en su historial, por eso no se puede eliminar. Para cerrarlo, desmarca “Disponible para reservas”.</p>
        ) : (
          <BotonConfirmar
            accion={eliminarEspacio.bind(null, id, e.id)}
            pregunta={`¿Eliminar ${e.nombre}? No tiene reservas.`}
            className="font-semibold text-peligro hover:underline"
          >
            Eliminar este espacio
          </BotonConfirmar>
        )}
      </div>
    </>
  );
}
