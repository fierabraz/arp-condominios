import { Card, Insignia, Tabla, Vacio } from "@/components/ui";
import { ETIQUETAS_MEDIO_PAGO, formatoFecha, formatoMoneda } from "@/lib/formato";
import { nombrePeriodo } from "@/lib/cobro";
import type { estadoCuenta } from "@/lib/cobro-servicio";
import { ESTADOS_TRANSFERENCIA, MENSAJE_PAGO_PENDIENTE } from "@/lib/pagos";

type Estado = NonNullable<Awaited<ReturnType<typeof estadoCuenta>>>;

/**
 * Estado de cuenta de una unidad (lo ven el residente y la administración, con los mismos datos).
 * FIN-COMP A: separa lo confirmado de lo pendiente. Un pago informado sin verificar se muestra,
 * pero no resta de la deuda ni suma a lo pagado.
 */
export function EstadoCuenta({ estado, moneda, administracion = false }: { estado: Estado; moneda: string; administracion?: boolean }) {
  const $ = (n: number | { toString(): string }) => formatoMoneda(n, moneda);
  const ahora = new Date();
  const pendientes = estado.enVerificacion;
  return (
    <>
      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-sm text-texto-suave">Total adeudado confirmado</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{$(estado.deuda)}</p>
          {estado.vencida > 0 && <p className="mt-1 text-sm font-semibold text-peligro">{$(estado.vencida)} vencido</p>}
        </Card>
        <Card>
          <p className="text-sm text-texto-suave">Pagos registrados</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{$(estado.pagado)}</p>
          <p className="mt-1 text-xs text-texto-suave">Recibidos y registrados por la administración.</p>
        </Card>
        <Card className={pendientes.cantidad > 0 ? "border-alerta/50 bg-alerta-suave/40" : undefined}>
          <p className="text-sm text-texto-suave">Pendiente de verificación</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{$(pendientes.monto)}</p>
          <p className="mt-1 text-xs text-texto-suave">
            {pendientes.cantidad > 0 ? "Informado, todavía no descuenta de la deuda." : "Sin pagos informados por verificar."}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-texto-suave">Saldo a favor confirmado</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{$(estado.aFavor)}</p>
        </Card>
      </div>

      {pendientes.cantidad > 0 && (
        <section aria-label="Pagos pendientes de verificación" className="mb-6 rounded-2xl border border-alerta/40 bg-alerta-suave/60 p-4">
          <p className="font-bold">{pendientes.cantidad === 1 ? "Pago pendiente de verificación" : `${pendientes.cantidad} pagos pendientes de verificación`}</p>
          <p className="mt-1 text-sm">
            {administracion
              ? "El residente informó estos pagos. No cuentan como recaudación hasta verificarlos con la cartola del banco."
              : MENSAJE_PAGO_PENDIENTE}
          </p>
          <ul className="mt-3 space-y-1 text-sm">
            {pendientes.lista.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2">
                <Insignia tono="alerta">{ESTADOS_TRANSFERENCIA[t.estado].texto}</Insignia>
                <span className="font-semibold tabular-nums">{$(t.monto)}</span>
                <span className="text-texto-suave">
                  transferido el {formatoFecha(t.fecha)}
                  {t.operacion && ` · operación ${t.operacion}`} · informado el {formatoFecha(t.creadoEn)}
                </span>
                {t.comprobante && (
                  <a href={`/comprobantes/${t.id}`} target="_blank" rel="noopener" className="font-semibold text-marca">
                    comprobante
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

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
                <li key={a.id} className="flex flex-col gap-1 sombra-convive rounded-2xl border border-borde bg-white p-4">
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
              {administracion && <th>Banco</th>}
              <th className="text-right">Monto</th>
            </tr>
          </thead>
          <tbody>
            {estado.pagos.map((p) => (
              <tr key={p.id} className={p.anuladoEn ? "text-texto-suave" : undefined}>
                <td className="whitespace-nowrap">{formatoFecha(p.fecha)}</td>
                <td>{ETIQUETAS_MEDIO_PAGO[p.medio]}</td>
                <td className="text-texto-suave">
                  {p.referencia ?? "—"}
                  {p.anuladoEn && <span className="ml-2"><Insignia tono="peligro">Anulado o reversado</Insignia></span>}
                </td>
                {administracion && (
                  <td className="whitespace-nowrap text-sm">
                    {p.anuladoEn ? "—" : p.conciliaciones.length > 0 ? (
                      <Insignia tono="exito">Conciliado {formatoFecha(p.conciliaciones[0].movimiento.fecha)}</Insignia>
                    ) : (
                      <span className="text-texto-suave">Sin movimiento bancario</span>
                    )}
                  </td>
                )}
                <td className={`text-right tabular-nums ${p.anuladoEn ? "line-through" : ""}`}>{$(p.monto)}</td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
