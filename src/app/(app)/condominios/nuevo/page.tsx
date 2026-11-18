import Link from "next/link";
import { requireAdministradora } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { CondominioForm } from "../condominio-form";
import { crearCondominio } from "../actions";
import { crearComunidadVisual } from "../generador-actions";
import { NuevaComunidad } from "./nueva-comunidad";
import { demoPermitida } from "@/lib/demo-financiera";
import { crearComunidadDemoAccion } from "../prueba-actions";
import { Boton } from "@/components/ui";

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
      {demoPermitida() && (
        <Card className="mt-6 border-dashed">
          <h2 className="font-bold">¿Solo quieres probar el módulo financiero?</h2>
          <p className="mb-3 mt-1 text-sm text-texto-suave">
            Crea una comunidad FICTICIA lista para probar pagos y conciliación: 8 unidades, un mes emitido, cuenta bancaria inventada y un residente de prueba.
            Esta opción solo aparece en la vista previa, nunca en el sitio real.
          </p>
          <form action={crearComunidadDemoAccion}>
            <Boton type="submit" variante="secundario">Crear comunidad ficticia de prueba</Boton>
          </form>
        </Card>
      )}
    </>
  );
}
