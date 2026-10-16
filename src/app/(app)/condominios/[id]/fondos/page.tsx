import { db } from "@/lib/db";
import { Card, PageHeader, Tabla, Vacio } from "@/components/ui";
import { formatoMoneda, formatoPorcentaje } from "@/lib/formato";
import { nombrePeriodo } from "@/lib/cobro";
import { condominioVisible } from "../condominio-actual";

export default async function FondosPage({ params }: PageProps<"/condominios/[id]/fondos">) {
  const { id } = await params;
  const { condominio, moneda } = await condominioVisible(id);
  const periodos = await db.periodo.findMany({
    where: { condominioId: id, estado: "CERRADO" },
    orderBy: [{ anio: "asc" }, { mes: "asc" }],
    include: { avisos: { select: { fondoReserva: true } } },
  });
  const redondear = (x: number) => Math.round(x * 100) / 100;
  const montos = periodos.map((p) => redondear(p.avisos.reduce((s, a) => s + Number(a.fondoReserva), 0)));
  const filas = periodos.map((p, i) => ({
    id: p.id,
    nombre: nombrePeriodo(p.anio, p.mes),
    monto: montos[i],
    acumulado: redondear(montos.slice(0, i + 1).reduce((s, m) => s + m, 0)),
  }));
  const acumulado = filas.at(-1)?.acumulado ?? 0;
  const $ = (x: number) => formatoMoneda(x, moneda);
  return (
    <>
      <PageHeader titulo="Fondos" descripcion={`${condominio.nombre} · Fondo de reserva cobrado en cada aviso mensual.`} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <p className="text-sm text-gray-600">Fondo de reserva acumulado</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{$(acumulado)}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-600">Aporte mensual</p>
          <p className="mt-1 text-2xl font-semibold">{formatoPorcentaje(condominio.porcentajeReserva, 2)} del gasto común</p>
        </Card>
      </div>
      {filas.length === 0 ? (
        <Vacio>El fondo crece con cada mes cerrado.</Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th>Mes</th>
              <th className="text-right">Aporte del mes</th>
              <th className="text-right">Acumulado</th>
            </tr>
          </thead>
          <tbody>
            {[...filas].reverse().map((f) => (
              <tr key={f.id}>
                <td>{f.nombre}</td>
                <td className="text-right tabular-nums">{$(f.monto)}</td>
                <td className="text-right tabular-nums font-medium">{$(f.acumulado)}</td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
      <p className="mt-3 text-xs text-gray-500">
        Muestra lo cobrado al fondo en los avisos. Los retiros del fondo y el saldo en banco llegarán con la conciliación bancaria.
      </p>
    </>
  );
}
