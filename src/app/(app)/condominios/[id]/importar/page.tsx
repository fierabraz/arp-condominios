import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { BotonDocumento, Card, PageHeader } from "@/components/ui";
import { COLUMNAS } from "@/lib/importacion";
import { condominioVisible } from "../condominio-actual";
import { confirmarImportacion, revisarPlanilla } from "../../importar-actions";
import { ImportarForm } from "./importar-form";

export default async function ImportarPage({ params }: PageProps<"/condominios/[id]/importar">) {
  const { id } = await params;
  const { condominio, editable } = await condominioVisible(id);
  if (!editable) notFound();

  return (
    <>
      <PageHeader
        titulo="Cargar desde Excel"
        descripcion={`${condominio.nombre} · Unidades, alícuotas, propietarios y residentes de una sola vez.`}
      />

      <ol className="mb-6 grid gap-3 md:grid-cols-3 md:gap-4">
        <li>
          <Card className="h-full">
            <p className="text-sm font-bold text-marca">Paso 1</p>
            <p className="mt-1 font-semibold">Descarga la planilla</p>
            <p className="mt-1 mb-3 text-sm text-texto-suave">
              Viene con las columnas listas y con lo que la propiedad ya tiene cargado.
            </p>
            <BotonDocumento href={`/condominios/${id}/importar/plantilla`} target="_self">
              <Download size={16} aria-hidden="true" /> Descargar planilla
            </BotonDocumento>
          </Card>
        </li>
        <li>
          <Card className="h-full">
            <p className="text-sm font-bold text-marca">Paso 2</p>
            <p className="mt-1 font-semibold">Complétala en Excel</p>
            <p className="mt-1 text-sm text-texto-suave">
              Una fila por persona y unidad. También sirve tu propia planilla si tiene columnas parecidas (Unidad, Alícuota,
              Nombre, RUT, Correo…).
            </p>
          </Card>
        </li>
        <li>
          <Card className="h-full">
            <p className="text-sm font-bold text-marca">Paso 3</p>
            <p className="mt-1 font-semibold">Súbela y revisa</p>
            <p className="mt-1 text-sm text-texto-suave">
              Antes de guardar te mostramos qué se va a crear o cambiar. Nada se borra.
            </p>
          </Card>
        </li>
      </ol>

      <Card className="mb-6">
        <ImportarForm
          condominioId={id}
          revisar={revisarPlanilla.bind(null, id)}
          confirmar={confirmarImportacion.bind(null, id)}
        />
      </Card>

      <details className="sombra-convive rounded-2xl border border-borde bg-white p-5 text-sm">
        <summary className="cursor-pointer font-semibold">Qué va en cada columna</summary>
        <dl className="mt-3 grid gap-x-6 gap-y-2 md:grid-cols-[10rem_1fr]">
          {COLUMNAS.map((c) => (
            <div key={c.clave} className="contents">
              <dt className="font-semibold">{c.titulo}</dt>
              <dd className="text-texto-suave">{c.ayuda}</dd>
            </div>
          ))}
        </dl>
      </details>
    </>
  );
}
