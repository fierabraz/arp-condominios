import { Card, Tabla, Vacio } from "@/components/ui";
import { ETIQUETAS_MEDIO_PAGO, formatoFecha, formatoMoneda } from "@/lib/formato";
import { nombrePeriodo } from "@/lib/cobro";
import type { estadoCuenta } from "@/lib/cobro-servicio";

type Estado = NonNullable<Awaited<ReturnType<typeof estadoCuenta>>>;

export function EstadoCuenta({ estado, moneda }: { estado: Estado; moneda: string }) {
  const $ = (n: number | { toString(): string }) => formatoMoneda(n, moneda);
  const ahora = new Date();
  return (
    <>
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-gray-600">Deuda total</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{$(estado.deuda)}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-600">Vencida</p>
          <p className={`mt-1 text-2xl font-semibold tabular-nums ${estado.vencida > 0 ? "text-amber-700" : ""}`}>
            {$(estado.vencida)}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-gray-600">Saldo a favor</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{$(estado.aFavor)}</p>
        </Card>
      </div>

      <h3 className="mb-2 text-sm font-medium text-gray-700">Avisos de cobro</h3>
      {estado.avisos.length === 0 ? (
        <Vacio>Sin avisos de cobro.</Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th>Período</th>
              <th>Vence</th>
              <th className="text-right">Gasto común</th>
              <th className="text-right">Reserva</th>
              <th className="text-right">Cargos e intereses</th>
              <th className="text-right">Total</th>
              <th className="text-right">Saldo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {estado.avisos.map((a) => {
              const saldo = Number(a.saldo);
              const vencido = saldo > 0 && a.vencimiento < ahora;
              return (
                <tr key={a.id}>
                  <td>{nombrePeriodo(a.periodo.anio, a.periodo.mes)}</td>
                  <td className="whitespace-nowrap">{formatoFecha(a.vencimiento)}</td>
                  <td className="text-right tabular-nums">{$(a.gastoComun)}</td>
                  <td className="text-right tabular-nums">{$(a.fondoReserva)}</td>
                  <td className="text-right tabular-nums">{$(Number(a.cargos) + Number(a.interes))}</td>
                  <td className="text-right tabular-nums">{$(a.total)}</td>
                  <td
                    className={`text-right font-medium tabular-nums ${
                      saldo === 0 ? "text-green-700" : vencido ? "text-amber-700" : ""
                    }`}
                  >
                    {saldo === 0 ? "Pagado" : `${$(saldo)}${vencido ? " vencido" : ""}`}
                  </td>
                  <td className="text-right">
                    <a href={`/avisos/${a.id}/pdf`} target="_blank" rel="noopener" className="text-sm text-blue-700 hover:underline">
                      PDF
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Tabla>
      )}

      <h3 className="mb-2 mt-6 text-sm font-medium text-gray-700">Pagos</h3>
      {estado.pagos.length === 0 ? (
        <Vacio>Sin pagos registrados.</Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Medio</th>
              <th>Referencia</th>
              <th className="text-right">Monto</th>
            </tr>
          </thead>
          <tbody>
            {estado.pagos.map((p) => (
              <tr key={p.id}>
                <td className="whitespace-nowrap">{formatoFecha(p.fecha)}</td>
                <td>{ETIQUETAS_MEDIO_PAGO[p.medio]}</td>
                <td className="text-gray-600">{p.referencia ?? "—"}</td>
                <td className="text-right tabular-nums">{$(p.monto)}</td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
