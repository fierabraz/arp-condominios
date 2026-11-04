import { requireUsuario } from "@/lib/auth";
import { Insignia, PageHeader, Vacio } from "@/components/ui";
import { formatoPorcentaje } from "@/lib/formato";
import { EstadoCuenta } from "@/components/estado-cuenta";
import { db } from "@/lib/db";
import { cuentasDe, unidadesVisibles } from "../../datos-residente";

export default async function PagosPage({ searchParams }: PageProps<"/mi-cuenta/pagos">) {
  const usuario = await requireUsuario(["RESIDENTE"]);
  const moneda = usuario.administradora?.moneda ?? "CLP";
  const { visibles } = await unidadesVisibles(usuario, (await searchParams).unidad);
  const cuentas = await cuentasDe(usuario, visibles);
  const alicuotas = new Map(
    (await db.unidad.findMany({ where: { id: { in: visibles.map((u) => u.id) } }, select: { id: true, alicuota: true } })).map(
      (u) => [u.id, u.alicuota],
    ),
  );
  // Primero las unidades que deben más.
  const ordenadas = [...cuentas].sort((a, b) => b.estado.deuda - a.estado.deuda);

  return (
    <>
      <PageHeader titulo="Mi cuenta" descripcion="Tus gastos comunes, avisos de cobro y pagos. Cada aviso se puede descargar en PDF." />
      {ordenadas.length === 0 ? (
        <Vacio>Tu cuenta aún no está vinculada a ninguna unidad. Contacta a tu administración.</Vacio>
      ) : (
        <div className="space-y-10">
          {ordenadas.map(({ unidad, estado }) => (
            <section key={unidad.id} aria-labelledby={`unidad-${unidad.id}`}>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <h2 id={`unidad-${unidad.id}`} className="text-xl font-bold">
                  {unidad.nombre}
                </h2>
                {estado.vencida > 0 ? (
                  <Insignia tono="peligro">Deuda vencida</Insignia>
                ) : estado.deuda > 0 ? (
                  <Insignia tono="alerta">Por pagar</Insignia>
                ) : (
                  <Insignia tono="exito">Al día</Insignia>
                )}
              </div>
              <p className="mb-4 text-sm text-texto-suave">
                {unidad.condominioNombre}
                {alicuotas.has(unidad.id) && ` · Alícuota ${formatoPorcentaje(alicuotas.get(unidad.id)!)}`}
              </p>
              <EstadoCuenta estado={estado} moneda={moneda} />
            </section>
          ))}
        </div>
      )}
    </>
  );
}
