import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader, Tabla, Vacio } from "@/components/ui";
import { formatoFecha, formatoMoneda } from "@/lib/formato";
import { nombrePeriodo } from "@/lib/cobro";
import { condominioVisible } from "../condominio-actual";

export default async function EgresosPage({ params }: PageProps<"/condominios/[id]/egresos">) {
  const { id } = await params;
  const { condominio, moneda } = await condominioVisible(id);
  const gastos = await db.gasto.findMany({
    where: { periodo: { condominioId: id } },
    orderBy: [{ fecha: "desc" }, { creadoEn: "desc" }],
    include: { periodo: { select: { id: true, anio: true, mes: true } }, unidad: { select: { numero: true } } },
  });
  const total = gastos.reduce((s, g) => s + Number(g.monto), 0);
  return (
    <>
      <PageHeader titulo="Egresos" descripcion={`${condominio.nombre} · Todos los gastos registrados, del más reciente al más antiguo.`} />
      {gastos.length === 0 ? (
        <Vacio>Aún no hay gastos registrados. Se cargan en Gasto común, dentro de cada mes.</Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Mes</th>
              <th>Categoría</th>
              <th>Detalle</th>
              <th>Proveedor</th>
              <th className="text-right">Monto</th>
            </tr>
          </thead>
          <tbody>
            {gastos.map((g) => (
              <tr key={g.id}>
                <td className="whitespace-nowrap">{formatoFecha(g.fecha)}</td>
                <td className="whitespace-nowrap">
                  <Link href={`/condominios/${id}/periodos/${g.periodo.id}`} className="text-marca hover:underline">
                    {nombrePeriodo(g.periodo.anio, g.periodo.mes)}
                  </Link>
                </td>
                <td>{g.categoria}</td>
                <td>
                  {g.descripcion}
                  {g.tipo === "INDIVIDUAL" && g.unidad && <span className="text-texto-suave"> · unidad {g.unidad.numero}</span>}
                </td>
                <td className="text-texto-suave">{g.proveedor ?? "—"}</td>
                <td className="text-right tabular-nums">{formatoMoneda(g.monto, moneda)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td colSpan={5}>Total</td>
              <td className="text-right tabular-nums">{formatoMoneda(total, moneda)}</td>
            </tr>
          </tbody>
        </Tabla>
      )}
    </>
  );
}
