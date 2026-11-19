import Link from "next/link";
import { requireAdministradora } from "@/lib/auth";
import { BotonLink, Card, PageHeader } from "@/components/ui";
import { CondominioForm } from "../condominio-form";
import { crearCondominio } from "../actions";
import { crearComunidadVisual } from "../generador-actions";
import { NuevaComunidad } from "./nueva-comunidad";
import { LineaCupo } from "@/components/cupo-comunidades";
import { cupoDe } from "@/lib/planes-servicio";

export default async function NuevoCondominioPage({ searchParams }: PageProps<"/condominios/nuevo">) {
  const { administradoraId } = await requireAdministradora("propiedades.crear");
  // SUS-001: sin cupo en el plan no se muestra el formulario (la acción también lo revisa).
  const cupo = await cupoDe(administradoraId);
  if (!cupo.puede) {
    return (
      <>
        <PageHeader titulo="Nueva comunidad" descripcion="Tu plan no permite crear más comunidades por ahora." />
        <Card>
          <p role="status" className="rounded-xl bg-alerta-suave px-4 py-3 text-alerta">
            {cupo.motivo}
          </p>
          <div className="mt-4">
            <BotonLink href="/condominios">Volver a Mis propiedades</BotonLink>
          </div>
        </Card>
      </>
    );
  }
  const formulario = (await searchParams).formulario === "1";
  if (formulario) {
    return (
      <>
        <PageHeader
          titulo="Crear propiedad"
          descripcion="Queda “En configuración” hasta que completes sus datos. Puedes guardar a medias y continuar después."
          acciones={
            <Link href="/condominios/nuevo" className="text-sm font-semibold text-marca underline">
              Usar el asistente visual
            </Link>
          }
        />
        {cupo.plan && <div className="mb-3"><LineaCupo cupo={cupo} /></div>}
        <Card>
          <CondominioForm accion={crearCondominio} textoBoton="Guardar y continuar" />
        </Card>
      </>
    );
  }
  return (
    <>
      <PageHeader
        titulo="Nueva comunidad"
        descripcion="Responde unas preguntas sencillas y mira cómo se arma la comunidad en un esquema en planta."
        acciones={
          <Link href="/condominios/nuevo?formulario=1" className="text-sm font-semibold text-marca underline">
            Prefiero el formulario completo
          </Link>
        }
      />
      {cupo.plan && <div className="mb-3"><LineaCupo cupo={cupo} /></div>}
      <Card>
        <NuevaComunidad accion={crearComunidadVisual} />
      </Card>
    </>
  );
}
