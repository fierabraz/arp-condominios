import { requirePermiso } from "@/lib/auth";
import { BotonDocumento, BotonLink, Insignia, PageHeader, Vacio } from "@/components/ui";
import { formatoFolioCertificado } from "@/lib/certificados";
import { formatoPorcentaje } from "@/lib/formato";
import { EstadoCuenta } from "@/components/estado-cuenta";
import { db } from "@/lib/db";
import { conUnidad, cuentasDe, unidadesVisibles } from "../../datos-residente";

export default async function PagosPage({ searchParams }: PageProps<"/mi-cuenta/pagos">) {
  const usuario = await requirePermiso("portal.residente");
  const moneda = usuario.administradora?.moneda ?? "CLP";
  const { visibles, elegida } = await unidadesVisibles(usuario, (await searchParams).unidad);
  const cuentas = await cuentasDe(usuario, visibles);
  const alicuotas = new Map(
    (await db.unidad.findMany({ where: { id: { in: visibles.map((u) => u.id) } }, select: { id: true, alicuota: true } })).map(
      (u) => [u.id, u.alicuota],
    ),
  );
  const certificados = await db.certificadoAlDia.findMany({
    where: { unidadId: { in: visibles.map((u) => u.id) } },
    orderBy: { emitidoEn: "desc" },
    select: { id: true, folio: true, emitidoEn: true, unidadId: true },
  });
  // Primero las unidades que deben más.
  const ordenadas = [...cuentas].sort((a, b) => b.estado.deuda - a.estado.deuda);

  return (
    <>
      <PageHeader
        titulo="Mi cuenta"
        descripcion="Tus gastos comunes, avisos de cobro y pagos. Cada aviso se puede descargar en PDF."
        acciones={<BotonLink href={conUnidad("/mi-cuenta/pagar", elegida?.id)}>Pagar gastos comunes</BotonLink>}
      />
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
                {alicuotas.has(unidad.id) && ` · Porcentaje de prorrateo ${formatoPorcentaje(alicuotas.get(unidad.id)!)}`}
              </p>
              <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
                <BotonDocumento href={`/documentos/estado-cuenta/${unidad.id}`}>Descargar estado de cuenta (PDF)</BotonDocumento>
                {certificados
                  .filter((c) => c.unidadId === unidad.id)
                  .slice(0, 3)
                  .map((c) => (
                    <a key={c.id} href={`/documentos/certificado/${c.id}`} target="_blank" rel="noopener" className="font-semibold text-marca">
                      Certificado al día {formatoFolioCertificado(c.folio)} ({c.emitidoEn.toLocaleDateString("es-CL")})
                    </a>
                  ))}
              </div>
              <EstadoCuenta estado={estado} moneda={moneda} />
            </section>
          ))}
        </div>
      )}
    </>
  );
}
