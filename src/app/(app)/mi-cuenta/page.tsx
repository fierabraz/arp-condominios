import { requireUsuario } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, Vacio } from "@/components/ui";
import { ETIQUETAS_TIPO_UNIDAD, formatoPorcentaje } from "@/lib/formato";
import { estadoCuenta } from "@/lib/cobro-servicio";
import { nombrePeriodo } from "@/lib/cobro";
import { EstadoCuenta } from "@/components/estado-cuenta";
import { TarjetaPublicacion } from "@/components/publicacion";
import { VotacionesResidente } from "./votaciones-residente";

export default async function MiCuentaPage() {
  const usuario = await requireUsuario(["RESIDENTE"]);
  const vinculos = usuario.personaId
    ? await db.unidadPersona.findMany({
        where: { personaId: usuario.personaId },
        include: { unidad: { include: { condominio: { select: { nombre: true, direccion: true } } } } },
      })
    : [];
  // Una unidad puede aparecer dos veces (propietario y residente): mostrar su cuenta una sola vez.
  const unidadesUnicas = [...new Map(vinculos.map((v) => [v.unidadId, v])).values()];
  const condominioIds = [...new Set(unidadesUnicas.map((v) => v.unidad.condominioId))];
  const rendiciones = await db.periodo.findMany({
    where: { condominioId: { in: condominioIds }, estado: "CERRADO" },
    orderBy: [{ anio: "desc" }, { mes: "desc" }],
    take: 12,
    include: { condominio: { select: { nombre: true } } },
  });
  const publicaciones = await db.publicacion.findMany({
    where: { condominioId: { in: condominioIds } },
    orderBy: { creadoEn: "desc" },
    take: 5,
    include: { condominio: { select: { id: true, nombre: true } } },
  });
  const estados = await Promise.all(
    unidadesUnicas.map(async (v) => ({ v, estado: await estadoCuenta(v.unidadId, usuario.administradoraId!) })),
  );

  return (
    <>
      <PageHeader titulo="Mi cuenta" descripcion={`Hola, ${usuario.nombre}`} />
      {usuario.personaId && <VotacionesResidente personaId={usuario.personaId} condominioIds={condominioIds} />}
      {publicaciones.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-xl font-semibold text-emerald-700">Muro de la comunidad</h2>
          <div className="space-y-3">
            {publicaciones.map((p) => (
              <TarjetaPublicacion key={p.id} p={p} editable={false} completa />
            ))}
          </div>
        </section>
      )}
      {vinculos.length === 0 ? (
        <Vacio>Tu cuenta aún no está vinculada a ninguna unidad. Contacta a tu administración.</Vacio>
      ) : (
        <div className="space-y-10">
          {estados.map(({ v, estado }) => (
            <section key={v.unidadId}>
              <p className="text-sm text-gray-600">{v.unidad.condominio.nombre}</p>
              <h2 className="mb-1 text-xl font-semibold">
                {ETIQUETAS_TIPO_UNIDAD[v.unidad.tipo]} {v.unidad.numero}
              </h2>
              <p className="mb-4 text-sm text-gray-600">Alícuota {formatoPorcentaje(v.unidad.alicuota)}</p>
              {estado && <EstadoCuenta estado={estado} moneda={usuario.administradora?.moneda ?? "CLP"} />}
            </section>
          ))}
        </div>
      )}
      {rendiciones.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-1 text-xl font-semibold">Rendiciones de gastos</h2>
          <p className="mb-4 text-sm text-gray-600">En qué se gastó el dinero de la comunidad cada mes.</p>
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {rendiciones.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span>
                  {nombrePeriodo(r.anio, r.mes)}
                  {condominioIds.length > 1 && <span className="text-gray-500"> · {r.condominio.nombre}</span>}
                </span>
                <a href={`/rendiciones/${r.id}/pdf`} target="_blank" rel="noopener" className="text-blue-700 hover:underline">
                  Descargar PDF
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
