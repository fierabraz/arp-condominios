import Link from "next/link";
import { requireAdministradora } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { CondominioForm } from "../condominio-form";
import { crearCondominio } from "../actions";
import { crearComunidadVisual } from "../generador-actions";
import { NuevaComunidad } from "./nueva-comunidad";

export default async function NuevoCondominioPage({ searchParams }: PageProps<"/condominios/nuevo">) {
  await requireAdministradora("propiedades.crear");
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
      <Card>
        <NuevaComunidad accion={crearComunidadVisual} />
      </Card>
    </>
  );
}
