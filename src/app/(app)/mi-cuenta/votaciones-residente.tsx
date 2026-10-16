import { db } from "@/lib/db";
import { Card } from "@/components/ui";
import { ResultadosVotacion } from "@/components/resultados-votacion";
import { formatoFechaHora } from "@/lib/formato";
import { estadoEfectivo } from "@/lib/votacion";
import { cargarVotacion, unidadesConVoto } from "@/lib/votaciones-servicio";
import { votar } from "@/app/(app)/condominios/votaciones-actions";
import { VotarForm } from "./votar-form";

/** Votaciones abiertas para votar y resultados de las últimas cerradas, en las propiedades del residente. */
export async function VotacionesResidente({ personaId, condominioIds }: { personaId: string; condominioIds: string[] }) {
  const ahora = new Date();
  const hace90dias = new Date(ahora.getTime() - 90 * 86_400_000);
  const votaciones = await db.votacion.findMany({
    where: { condominioId: { in: condominioIds }, estado: { not: "BORRADOR" }, cierraEn: { gt: hace90dias } },
    orderBy: { cierraEn: "desc" },
    take: 10,
    include: { condominio: { select: { nombre: true } } },
  });
  if (votaciones.length === 0) return null;
  const abiertas = votaciones.filter((v) => estadoEfectivo(v, ahora) === "ABIERTA");
  const cerradas = votaciones.filter((v) => estadoEfectivo(v, ahora) === "CERRADA").slice(0, 3);

  const tarjetasAbiertas = await Promise.all(
    abiertas.map(async (v) => {
      const [datos, mias] = await Promise.all([cargarVotacion(v.id, v.condominioId), unidadesConVoto(personaId, v.condominioId)]);
      const votos = new Map(datos!.votacion.votos.map((x) => [x.unidadId, x]));
      return (
        <Card key={v.id}>
          <p className="text-sm text-gray-500">
            {v.condominio.nombre} · Vota hasta el {formatoFechaHora(v.cierraEn)}
          </p>
          <h3 className="mt-1 text-lg font-semibold">{v.titulo}</h3>
          {v.descripcion && <p className="mt-1 whitespace-pre-line text-sm text-gray-700">{v.descripcion}</p>}
          <div className="mt-4 space-y-4">
            {mias.length === 0 ? (
              <p className="text-sm text-gray-600">Votan los propietarios de cada unidad.</p>
            ) : (
              mias.map((u) => {
                const voto = votos.get(u.id);
                return (
                  <div key={u.id}>
                    {mias.length > 1 && <p className="mb-2 text-sm font-medium">Unidad {u.numero}</p>}
                    {voto ? (
                      <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                        {mias.length > 1 ? "Esta unidad votó" : "Ya votaste"}: <strong>{voto.opcion.texto}</strong>
                        {voto.presencial && ` (registrado por ${voto.emitidoPor})`}
                      </p>
                    ) : (
                      <VotarForm accion={votar.bind(null, v.id, u.id)} opciones={datos!.votacion.opciones} nombre={v.titulo} />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </Card>
      );
    }),
  );
  const tarjetasCerradas = await Promise.all(
    cerradas.map(async (v) => {
      const datos = (await cargarVotacion(v.id, v.condominioId))!;
      return (
        <Card key={v.id}>
          <p className="text-sm text-gray-500">
            {v.condominio.nombre} · Cerró el {formatoFechaHora(v.cerradaEn ?? v.cierraEn)}
          </p>
          <h3 className="mb-3 mt-1 text-lg font-semibold">{v.titulo}</h3>
          <ResultadosVotacion
            opciones={datos.resultados.opciones}
            ganadoraId={datos.resultados.ganadora?.id}
            ponderada={v.ponderacion === "ALICUOTA"}
          />
        </Card>
      );
    }),
  );

  return (
    <section className="mb-10 space-y-3">
      {tarjetasAbiertas.length > 0 && (
        <>
          <h2 className="text-xl font-semibold text-emerald-700">Votaciones abiertas</h2>
          {tarjetasAbiertas}
        </>
      )}
      {tarjetasCerradas.length > 0 && (
        <>
          <h2 className="pt-4 text-xl font-semibold">Resultados de votaciones</h2>
          {tarjetasCerradas}
        </>
      )}
    </section>
  );
}
