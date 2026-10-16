import { db } from "@/lib/db";
import { BotonDocumento, PageHeader, Tabla, Vacio } from "@/components/ui";
import { formatoFecha, formatoMoneda } from "@/lib/formato";
import { nombrePeriodo } from "@/lib/cobro";
import { condominioVisible } from "../condominio-actual";

export default async function RendicionesPage({ params }: PageProps<"/condominios/[id]/rendiciones">) {
  const { id } = await params;
  const { condominio, moneda } = await condominioVisible(id);
  const periodos = await db.periodo.findMany({
    where: { condominioId: id, estado: "CERRADO" },
    orderBy: [{ anio: "desc" }, { mes: "desc" }],
    include: { gastos: { select: { monto: true } } },
  });
  return (
    <>
      <PageHeader titulo="Rendiciones" descripcion={`${condominio.nombre} · Biblioteca de rendiciones mensuales en PDF.`} />
      {periodos.length === 0 ? (
        <Vacio>Cada mes cerrado genera su rendición.</Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th>Mes</th>
              <th>Cerrado el</th>
              <th className="text-right">Gastos del mes</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {periodos.map((p) => (
              <tr key={p.id}>
                <td className="font-medium">{nombrePeriodo(p.anio, p.mes)}</td>
                <td>{p.cerradoEn ? formatoFecha(p.cerradoEn) : "—"}</td>
                <td className="text-right tabular-nums">
                  {formatoMoneda(p.gastos.reduce((s, g) => s + Number(g.monto), 0), moneda)}
                </td>
                <td className="text-right">
                  <BotonDocumento href={`/rendiciones/${p.id}/pdf`} className="!px-3 !py-1 text-xs">
                    Rendición en PDF
                  </BotonDocumento>
                </td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
