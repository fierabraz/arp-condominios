import { requireUsuario } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, Vacio } from "@/components/ui";
import { ETIQUETAS_TIPO_UNIDAD, formatoPorcentaje } from "@/lib/formato";
import { estadoCuenta } from "@/lib/cobro-servicio";
import { EstadoCuenta } from "@/components/estado-cuenta";

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
  const estados = await Promise.all(
    unidadesUnicas.map(async (v) => ({ v, estado: await estadoCuenta(v.unidadId, usuario.administradoraId!) })),
  );

  return (
    <>
      <PageHeader titulo="Mi cuenta" descripcion={`Hola, ${usuario.nombre}`} />
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
    </>
  );
}
