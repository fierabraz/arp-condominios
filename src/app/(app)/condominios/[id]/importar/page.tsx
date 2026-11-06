import { notFound } from "next/navigation";
import { Download, ShieldCheck } from "lucide-react";
import { BotonDocumento, Card, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { COLUMNAS, type Mapeo } from "@/lib/importacion";
import { condominioVisible } from "../condominio-actual";
import { asignarColumnas, confirmarImportacion, eliminarPerfil, revisarPlanilla } from "../../importar-actions";
import { BotonAccion } from "../estructura/formularios";
import { ImportarForm } from "./importar-form";

const tituloDe = (clave: string) => COLUMNAS.find((c) => c.clave === clave)?.titulo ?? "No usar";

export default async function ImportarPage({ params }: PageProps<"/condominios/[id]/importar">) {
  const { id } = await params;
  const { condominio, editable, administradoraId } = await condominioVisible(id);
  if (!editable) notFound();
  // Los perfiles son de esta administradora: nunca se muestran ni se aplican en otra.
  const perfiles = await db.perfilImportacion.findMany({ where: { administradoraId }, orderBy: { nombre: "asc" } });

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
              Una fila por persona y unidad. También sirve tu propia planilla: si no reconocemos sus columnas, eliges qué es
              cada una y lo recordamos para la próxima.
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
          totalUnidades={condominio.totalUnidades}
          revisar={revisarPlanilla.bind(null, id)}
          asignar={asignarColumnas.bind(null, id)}
          confirmar={confirmarImportacion.bind(null, id)}
        />
      </Card>

      <p className="mb-6 flex items-start gap-2 text-sm text-texto-suave">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-marca" aria-hidden="true" />
        <span>
          El archivo no se guarda: solo se leen los valores de sus celdas (las fórmulas y macros no se ejecutan). Acepta .xlsx y
          .csv de hasta 900 KB. Nada se envía a otros servicios.
        </span>
      </p>

      {perfiles.length > 0 && (
        <section aria-labelledby="perfiles" className="mb-6">
          <h2 id="perfiles" className="mb-1 text-lg font-bold">
            Planillas propias recordadas
          </h2>
          <p className="mb-3 text-sm text-texto-suave">Cuando una planilla tiene estos títulos, sus columnas se leen solas.</p>
          <Card className="p-0">
            <ul className="divide-y divide-borde">
              {perfiles.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                  <span>
                    <span className="font-semibold">{p.nombre}</span>
                    <span className="block text-texto-suave">
                      {Object.entries(p.columnas as Mapeo)
                        .filter(([, d]) => d !== "ignorar")
                        .map(([t, d]) => `${t} → ${tituloDe(d)}`)
                        .join(" · ")}
                    </span>
                  </span>
                  <BotonAccion accion={eliminarPerfil.bind(null, id, p.id)} pregunta={`¿Olvidar el perfil «${p.nombre}»? Lo ya cargado no cambia.`}>
                    Olvidar
                  </BotonAccion>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

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
