import { notFound } from "next/navigation";
import { requireAdministradora } from "@/lib/auth";
import { db } from "@/lib/db";
import { Boton, Card, PageHeader } from "@/components/ui";
import { PersonaForm } from "../persona-form";
import { editarPersona, eliminarPersona } from "../actions";

export default async function PersonaPage({ params }: PageProps<"/personas/[id]">) {
  const { id } = await params;
  const { administradoraId } = await requireAdministradora();
  const p = await db.persona.findFirst({ where: { id, administradoraId } });
  if (!p) notFound();

  return (
    <>
      <PageHeader titulo={p.nombre} />
      <Card className="mb-6">
        <PersonaForm accion={editarPersona.bind(null, p.id)} textoBoton="Guardar cambios" valores={p} />
      </Card>
      <form action={eliminarPersona.bind(null, p.id)}>
        <Boton variante="peligro" type="submit">
          Eliminar persona
        </Boton>
      </form>
    </>
  );
}
