import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader, Tabla, Vacio } from "@/components/ui";
import { BotonConfirmar } from "@/components/boton-confirmar";
import { ResultadosVotacion } from "@/components/resultados-votacion";
import { formatoFechaHora, formatoPorcentaje } from "@/lib/formato";
import { cargarVotacion } from "@/lib/votaciones-servicio";
import {
  cerrarVotacion,
  eliminarVotacion,
  publicarVotacion,
  registrarVotoPresencial,
} from "../../../votaciones-actions";
import { VotoPresencialForm } from "../../../voto-presencial-form";
import { condominioVisible } from "../../condominio-actual";

const ETIQUETA = { BORRADOR: "Por publicar", ABIERTA: "Abierta", CERRADA: "Cerrada" } as const;
const COLOR = {
  BORRADOR: "bg-gray-100 text-gray-700",
  ABIERTA: "bg-emerald-50 text-emerald-700",
  CERRADA: "bg-blue-50 text-blue-700",
} as const;

export default async function VotacionPage({ params }: PageProps<"/condominios/[id]/votaciones/[votacionId]">) {
  const { id, votacionId } = await params;
  const { condominio, editable } = await condominioVisible(id);
  const datos = await cargarVotacion(votacionId, id);
  if (!datos) notFound();
  const { votacion: v, estado, resultados: r, unidades } = datos;
  const votaron = new Set(v.votos.map((x) => x.unidadId));
  const pendientes = unidades.filter((u) => !votaron.has(u.id));
  const ponderada = v.ponderacion === "ALICUOTA";
  const boton = "rounded-lg px-4 py-2 text-sm font-medium";

  return (
    <>
      <Link href={`/condominios/${id}/votaciones`} className="mb-3 inline-block text-sm text-blue-700 hover:underline">
        ← Votaciones
      </Link>
      <PageHeader
        titulo={v.titulo}
        descripcion={
          <span className="flex flex-wrap items-center gap-2">
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${COLOR[estado]}`}>{ETIQUETA[estado]}</span>
            {condominio.nombre} · Termina el {formatoFechaHora(v.cierraEn)} ·{" "}
            {ponderada ? "Votos ponderados por alícuota" : "Una unidad, un voto"}
          </span>
        }
        acciones={
          editable && (
            <>
              {estado === "BORRADOR" && (
                <>
                  <BotonConfirmar
                    accion={eliminarVotacion.bind(null, v.id)}
                    pregunta="¿Eliminar esta votación?"
                    className={`${boton} border border-red-200 bg-white text-red-700 hover:bg-red-50`}
                  >
                    Eliminar
                  </BotonConfirmar>
                  <BotonConfirmar
                    accion={publicarVotacion.bind(null, v.id)}
                    pregunta="¿Publicar la votación? Los propietarios podrán votar y se anunciará en el muro. Después no se puede editar."
                    className={`${boton} bg-emerald-500 text-white hover:bg-emerald-600`}
                  >
                    Publicar
                  </BotonConfirmar>
                </>
              )}
              {estado === "ABIERTA" && (
                <BotonConfirmar
                  accion={cerrarVotacion.bind(null, v.id)}
                  pregunta="¿Cerrar la votación ahora? Nadie más podrá votar."
                  className={`${boton} border border-gray-300 bg-white hover:bg-gray-50`}
                >
                  Cerrar votación
                </BotonConfirmar>
              )}
            </>
          )
        }
      />

      {v.descripcion && <p className="mb-6 whitespace-pre-line text-gray-700">{v.descripcion}</p>}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-gray-600">Respuestas</p>
          <p className="mt-1 text-2xl font-semibold">
            {r.unidadesVotaron} de {r.unidadesTotal}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-gray-600">Participación{ponderada && " (por alícuota)"}</p>
          <p className="mt-1 text-2xl font-semibold">{formatoPorcentaje(r.participacion, 1)}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-600">{estado === "CERRADA" ? "Resultado" : "Va ganando"}</p>
          <p className="mt-1 text-2xl font-semibold">{r.ganadora?.texto ?? (r.unidadesVotaron ? "Empate" : "—")}</p>
        </Card>
      </div>

      <Card className="mb-6">
        <h2 className="mb-4 font-medium">Resultados</h2>
        <ResultadosVotacion opciones={r.opciones} ganadoraId={r.ganadora?.id} ponderada={ponderada} />
      </Card>

      {editable && estado === "ABIERTA" && pendientes.length > 0 && (
        <Card className="mb-6">
          <h2 className="mb-1 font-medium">Registrar voto presencial</h2>
          <p className="mb-4 text-sm text-gray-600">Para votos recibidos en asamblea, por escrito o por teléfono.</p>
          <VotoPresencialForm
            accion={registrarVotoPresencial.bind(null, v.id)}
            unidades={pendientes}
            opciones={v.opciones}
          />
        </Card>
      )}

      {estado === "BORRADOR" ? (
        <Card>
          <h2 className="mb-2 font-medium">Opciones</h2>
          <ol className="list-decimal pl-5 text-gray-700">
            {v.opciones.map((o) => (
              <li key={o.id}>{o.texto}</li>
            ))}
          </ol>
        </Card>
      ) : v.votos.length === 0 ? (
        <Vacio>Aún no vota ninguna unidad.</Vacio>
      ) : (
        <>
          <h2 className="mb-3 font-medium">Detalle de votos</h2>
          <Tabla>
            <thead>
              <tr>
                <th>Unidad</th>
                <th>Voto</th>
                <th>Emitido por</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {v.votos.map((x) => (
                <tr key={x.id}>
                  <td className="font-medium">{x.unidad.numero}</td>
                  <td>{x.opcion.texto}</td>
                  <td>
                    {x.emitidoPor}
                    {x.presencial && <span className="text-gray-500"> (presencial)</span>}
                  </td>
                  <td>{formatoFechaHora(x.creadoEn)}</td>
                </tr>
              ))}
            </tbody>
          </Tabla>
          {pendientes.length > 0 && (
            <p className="mt-3 text-sm text-gray-600">Sin votar: {pendientes.map((u) => u.numero).join(", ")}.</p>
          )}
        </>
      )}
    </>
  );
}
