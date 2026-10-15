import Link from "next/link";
import { db } from "@/lib/db";
import { Card, PageHeader, Tabla, Vacio } from "@/components/ui";
import { formatoMoneda } from "@/lib/formato";
import { nombrePeriodo } from "@/lib/cobro";
import { abrirPeriodo } from "../../cobro-actions";
import { condominioVisible } from "../condominio-actual";
import { NavCondominio } from "../nav-condominio";
import { PeriodoForm } from "./periodo-form";

export default async function PeriodosPage({ params }: PageProps<"/condominios/[id]/periodos">) {
  const { id } = await params;
  const { condominio, editable, moneda } = await condominioVisible(id);

  const periodos = await db.periodo.findMany({
    where: { condominioId: id },
    orderBy: [{ anio: "desc" }, { mes: "desc" }],
    include: {
      gastos: { select: { monto: true } },
      avisos: { select: { total: true, saldo: true } },
    },
  });
  const ultimo = periodos[0];
  const siguiente = ultimo
    ? { anio: ultimo.mes === 12 ? ultimo.anio + 1 : ultimo.anio, mes: ultimo.mes === 12 ? 1 : ultimo.mes + 1 }
    : { anio: new Date().getFullYear(), mes: new Date().getMonth() + 1 };
  const suma = (xs: { toString(): string }[]) => xs.reduce<number>((s, x) => s + Number(x.toString()), 0);

  return (
    <>
      <PageHeader titulo={condominio.nombre} descripcion="Cada mes se abre un período, se cargan los gastos y se cierra para emitir los cobros." />
      <NavCondominio id={id} actual="/periodos" />
      {editable && (
        <Card className="mb-6">
          <h2 className="mb-4 font-medium">Abrir nuevo período</h2>
          <PeriodoForm accion={abrirPeriodo.bind(null, id)} {...siguiente} />
        </Card>
      )}
      {periodos.length === 0 ? (
        <Vacio>Aún no hay períodos.</Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th>Período</th>
              <th>Estado</th>
              <th className="text-right">Gastos</th>
              <th className="text-right">Cobrado</th>
              <th className="text-right">Por cobrar</th>
            </tr>
          </thead>
          <tbody>
            {periodos.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link href={`/condominios/${id}/periodos/${p.id}`} className="font-medium text-blue-700 hover:underline">
                    {nombrePeriodo(p.anio, p.mes)}
                  </Link>
                </td>
                <td>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      p.estado === "ABIERTO" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {p.estado === "ABIERTO" ? "Abierto" : "Cerrado"}
                  </span>
                </td>
                <td className="text-right tabular-nums">{formatoMoneda(suma(p.gastos.map((g) => g.monto)), moneda)}</td>
                <td className="text-right tabular-nums">
                  {p.estado === "CERRADO" ? formatoMoneda(suma(p.avisos.map((a) => a.total)), moneda) : "—"}
                </td>
                <td className="text-right tabular-nums">
                  {p.estado === "CERRADO" ? formatoMoneda(suma(p.avisos.map((a) => a.saldo)), moneda) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
