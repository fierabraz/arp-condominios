import { notFound } from "next/navigation";
import { requireAdministradora } from "@/lib/auth";
import { db } from "@/lib/db";
import { Boton, Card, Insignia, PageHeader } from "@/components/ui";
import { BotonInvitar } from "@/components/invitacion";
import { ETIQUETAS_ACCESO, puedeInvitar } from "@/lib/invitacion-estado";
import { estadoDePersona } from "@/lib/invitaciones";
import { DIAS_INVITACION } from "@/lib/recuperacion";
import { invitar } from "../../condominios/invitaciones-actions";
import { PersonaForm } from "../persona-form";
import { editarPersona, eliminarPersona } from "../actions";

export default async function PersonaPage({ params }: PageProps<"/personas/[id]">) {
  const { id } = await params;
  const { administradoraId } = await requireAdministradora();
  const p = await db.persona.findFirst({ where: { id, administradoraId }, include: { _count: { select: { unidades: true } } } });
  if (!p) notFound();
  const estado = (await estadoDePersona(p.id, administradoraId))!;
  const sinUnidad = p._count.unidades === 0;

  return (
    <>
      <PageHeader titulo={p.nombre} />
      <Card className="mb-6">
        <PersonaForm accion={editarPersona.bind(null, p.id)} textoBoton="Guardar cambios" valores={p} />
      </Card>
      <Card className="mb-6">
        <h2 className="mb-1 flex flex-wrap items-center gap-2 font-medium">
          Acceso a la app <Insignia tono={ETIQUETAS_ACCESO[estado].tono}>{ETIQUETAS_ACCESO[estado].texto}</Insignia>
        </h2>
        <p className="mb-4 text-sm text-texto-suave">
          {estado === "SIN_CORREO"
            ? "Agrega su correo arriba para poder invitarla a la app."
            : estado === "ACTIVA"
              ? "Ya creó su contraseña. Si la olvida, puede recuperarla desde el ingreso de residentes."
              : estado === "DESACTIVADA"
                ? "Su cuenta está desactivada."
                : sinUnidad
                  ? "Vincúlala primero a una unidad: sin unidad no vería nada en la app."
                  : `Recibe un enlace para crear su contraseña (sirve una vez y durante ${DIAS_INVITACION} días).`}
        </p>
        {puedeInvitar(estado) && !sinUnidad && (
          <BotonInvitar invitar={invitar.bind(null, p.id, undefined)} reenviar={estado !== "SIN_CUENTA"} />
        )}
      </Card>
      <form action={eliminarPersona.bind(null, p.id)}>
        <Boton variante="peligro" type="submit">
          Eliminar persona
        </Boton>
      </form>
    </>
  );
}
