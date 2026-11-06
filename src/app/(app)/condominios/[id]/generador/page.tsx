import Link from "next/link";
import { Mensaje, Insignia } from "@/components/ui";
import { ESTADOS, TONO_ESTADO } from "@/lib/configuracion";
import { datosGenerador } from "@/lib/generador-servicio";
import { condominioVisible } from "../condominio-actual";
import { Generador } from "./generador";

// COM-001-VIS · Generador visual de comunidades: asistente + vista en planta sobre los registros de siempre.
export default async function GeneradorPage({ params, searchParams }: PageProps<"/condominios/[id]/generador">) {
  const { id } = await params;
  const { creada } = await searchParams;
  const { condominio, editable } = await condominioVisible(id);
  const datos = await datosGenerador(id, condominio.tipo);
  const base = `/condominios/${id}`;

  return (
    <>
      <nav aria-label="Ruta" className="mb-2 text-sm text-texto-suave">
        <Link href={base} className="hover:text-marca">
          {condominio.nombre}
        </Link>
        <span aria-hidden="true"> › </span>
        <Link href={`${base}/configuracion`} className="hover:text-marca">
          Configuración
        </Link>
        <span aria-hidden="true"> › </span>
        <span>Generador visual</span>
      </nav>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-convive-oscuro md:text-[2rem]">Generador visual</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-texto-suave">
            {condominio.nombre}
            <Insignia tono={TONO_ESTADO[condominio.estado]}>{ESTADOS[condominio.estado].texto}</Insignia>
            {datos.generadoEn && <span>· Registros creados con el generador</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href={`${base}/unidades`} className="font-semibold text-marca underline">
            Unidades
          </Link>
          <Link href={`${base}/estructura`} className="font-semibold text-marca underline">
            Estructura física
          </Link>
          <Link href={`${base}/importar`} className="font-semibold text-marca underline">
            Cargar desde Excel
          </Link>
        </div>
      </div>
      {creada && (
        <div className="mb-4">
          <Mensaje tipo="ok" texto="Comunidad creada (en configuración). Responde las preguntas: el plano se arma mientras avanzas y tu avance se guarda solo." />
        </div>
      )}
      {!editable && (
        <div className="mb-4">
          <Mensaje tipo="ok" texto="Vista de solo lectura: el comité puede mirar el plano, pero no cambiarlo." />
        </div>
      )}
      <Generador
        condominioId={id}
        financiera={condominio.estado === "HABILITADA_FINANCIERA"}
        editable={editable}
        inicial={datos.respuestas}
        registros={datos.registros}
        existentes={datos.existentes}
        posiciones={datos.posiciones}
        generadoEn={datos.generadoEn}
      />
    </>
  );
}
