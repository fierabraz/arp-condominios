import { Card, Insignia, Tabla, Vacio } from "@/components/ui";
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
          <p className="text-sm text-texto-suave">Deuda total</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{$(estado.deuda)}</p>
        </Card>
        <Card>
          <p className="text-sm text-texto-suave">Vencida</p>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${estado.vencida > 0 ? "text-peligro" : ""}`}>
            {$(estado.vencida)}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-texto-suave">Saldo a favor</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{$(estado.aFavor)}</p>
        </Card>
      </div>

      <h4 className="mb-2 font-semibold">Avisos de cobro</h4>
      {estado.avisos.length === 0 ? (
        <Vacio>Sin avisos de cobro.</Vacio>
      ) : (
        <>
          <ul className="space-y-2 md:hidden">
            {estado.avisos.map((a) => {
              const saldo = Number(a.saldo);
              const vencido = saldo > 0 && a.vencimiento < ahora;
              return (
                <li key={a.id} className="flex flex-col gap-1 rounded-2xl border border-borde bg-white p-4">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{nombrePeriodo(a.periodo.anio, a.periodo.mes)}</span>
                    {saldo === 0 ? (
                      <Insignia tono="exito">Pagado</Insignia>
                    ) : vencido ? (
                      <Insignia tono="peligro">Vencido</Insignia>
                    ) : (
                      <Insignia tono="alerta">Por pagar</Insignia>
                    )}
                  </span>
                  <span className="text-sm text-texto-suave">
                    Total {$(a.total)} · vence el {formatoFecha(a.vencimiento)}
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-lg font-bold tabular-nums">{saldo === 0 ? "" : `Saldo ${$(saldo)}`}</span>
                    <a
                      href={`/avisos/${a.id}/pdf`}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex min-h-11 items-center font-semibold text-marca"
                    >
                      Ver aviso (PDF)
                    </a>
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="hidden md:block">
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
                          saldo === 0 ? "text-exito" : vencido ? "text-peligro" : ""
                        }`}
                      >
                        {saldo === 0 ? "Pagado" : `${$(saldo)}${vencido ? " vencido" : ""}`}
                      </td>
                      <td className="text-right">
                        <a
                          href={`/avisos/${a.id}/pdf`}
                          target="_blank"
                          rel="noopener"
                          className="text-sm text-marca hover:underline"
                        >
                          PDF
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Tabla>
          </div>
        </>
      )}

      <h4 className="mb-2 mt-6 font-semibold">Pagos</h4>
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
                <td className="text-texto-suave">{p.referencia ?? "—"}</td>
                <td className="text-right tabular-nums">{$(p.monto)}</td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
