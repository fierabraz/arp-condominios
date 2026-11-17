import Link from "next/link";
import { ArrowRight, CheckCircle2, Landmark, QrCode, Send } from "lucide-react";
import { requirePermiso } from "@/lib/auth";
import { BotonLink, Card, Insignia, PageHeader, Vacio } from "@/components/ui";
import { ETIQUETAS_MEDIO_PAGO, formatoFecha, formatoFechaHora, formatoMoneda } from "@/lib/formato";
import { nombrePeriodo } from "@/lib/cobro";
import { ESTADOS_TRANSFERENCIA } from "@/lib/pagos";
import { conUnidad, cuentasDe } from "../../datos-residente";
import { avisoDeUnidad, cuentaDeUnidad, unidadAPagar } from "./datos";

// PAG-001 · «Pagar gastos comunes»: la deuda de la unidad tal como la lleva Recaudación, el
// botón «Pagar» (datos para transferir) y el estado de las transferencias informadas.

export default async function PagarPage({ searchParams }: PageProps<"/mi-cuenta/pagar">) {
  const usuario = await requirePermiso("portal.residente");
  const sp = await searchParams;
  const moneda = usuario.administradora?.moneda ?? "CLP";
  const $ = (n: number | { toString(): string }) => formatoMoneda(n, moneda);
  const { todas, unidad } = await unidadAPagar(usuario, sp.unidad);

  if (todas.length === 0) {
    return (
      <>
        <PageHeader titulo="Pagar gastos comunes" />
        <Vacio>Tu cuenta aún no está vinculada a ninguna unidad. Contacta a tu administración.</Vacio>
      </>
    );
  }

  // Varias unidades y ninguna elegida: primero se elige cuál pagar.
  if (!unidad) {
    const cuentas = await cuentasDe(usuario, todas);
    return (
      <>
        <PageHeader titulo="Pagar gastos comunes" descripcion="Tienes más de una unidad. Elige cuál quieres consultar o pagar." />
        <ul className="grid gap-3 md:grid-cols-2">
          {cuentas.map(({ unidad: u, estado }) => (
            <li key={u.id}>
              <Link
                href={conUnidad("/mi-cuenta/pagar", u.id)}
                className="sombra-convive flex items-center justify-between gap-3 rounded-2xl border border-borde bg-white p-5 hover:border-convive"
              >
                <span>
                  <span className="block text-sm text-texto-suave">{u.condominioNombre}</span>
                  <span className="block text-lg font-bold">{u.nombre}</span>
                  <span className="block text-sm">
                    {estado.deuda > 0 ? <>Por pagar <strong className="tabular-nums">{$(estado.deuda)}</strong></> : "Al día"}
                  </span>
                </span>
                <ArrowRight size={22} aria-hidden="true" className="shrink-0 text-marca" />
              </Link>
            </li>
          ))}
        </ul>
      </>
    );
  }

  const [cuenta, escaneado] = await Promise.all([cuentaDeUnidad(usuario, unidad), avisoDeUnidad(unidad.id, sp.aviso)]);
  const { estado, pendientes, transferencias, enVerificacion } = cuenta;
  const ahora = new Date();
  const conAviso = (href: string) => conUnidad(escaneado ? `${href}?aviso=${escaneado.id}` : href, unidad.id);
  const informada = sp.informada === "1";

  return (
    <>
      <PageHeader titulo="Pagar gastos comunes" descripcion={`${unidad.condominioNombre} · ${unidad.nombre}`} />

      {informada && (
        <div role="status" className="mb-6 flex items-start gap-3 rounded-2xl border border-exito/30 bg-exito-suave p-4 text-exito">
          <CheckCircle2 size={24} aria-hidden="true" className="shrink-0" />
          <p>
            <strong className="block">Transferencia informada. Pendiente de verificación por la administración.</strong>
            <span className="text-sm text-texto">Tu saldo no cambia hasta que la administración la encuentre en la cartola del banco y la registre.</span>
          </p>
        </div>
      )}

      {escaneado && (
        <Card className="mb-6 border-convive/40">
          <p className="mb-3 flex items-center gap-2 font-bold text-convive-oscuro">
            <QrCode size={20} aria-hidden="true" /> Aviso de {nombrePeriodo(escaneado.periodo.anio, escaneado.periodo.mes).toLowerCase()}
          </p>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-texto-suave">Aviso original emitido</dt>
              <dd className="text-lg font-bold tabular-nums">{$(escaneado.total)}</dd>
              <dd className="text-texto-suave">Emitido el {formatoFecha(escaneado.emitidoEn)} · vence el {formatoFecha(escaneado.vencimiento)}</dd>
            </div>
            <div>
              <dt className="text-texto-suave">Pagos registrados a este aviso</dt>
              <dd className="text-lg font-bold tabular-nums">{$(Number(escaneado.total) - Number(escaneado.saldo))}</dd>
            </div>
            <div>
              <dt className="text-texto-suave">Pendiente de este aviso hoy</dt>
              <dd className={`text-lg font-bold tabular-nums ${Number(escaneado.saldo) > 0 ? "" : "text-exito"}`}>
                {Number(escaneado.saldo) > 0 ? $(escaneado.saldo) : "Pagado"}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-sm text-texto-suave">Más abajo está la situación actual completa de tu unidad, con todo lo que sigue pendiente.</p>
        </Card>
      )}

      <section aria-labelledby="saldo" className="mb-8 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="bg-gradient-to-br from-white to-convive-suave/60">
          <h2 id="saldo" className="text-sm font-semibold text-texto-suave">
            Saldo total actualizado
          </h2>
          <p className="mt-1 text-4xl font-bold tabular-nums text-convive-oscuro">{$(estado.deuda)}</p>
          <p className="mt-1 text-sm text-texto-suave">
            {estado.deuda === 0
              ? "No tienes montos pendientes."
              : estado.vencida > 0
                ? <>De eso, <strong className="text-peligro">{$(estado.vencida)}</strong> ya está vencido.</>
                : `Incluye ${pendientes.length} aviso${pendientes.length === 1 ? "" : "s"} con saldo pendiente.`}
          </p>
          {estado.aFavor > 0 && <p className="mt-1 text-sm">Saldo a favor: <strong>{$(estado.aFavor)}</strong> (se aplicará al próximo cobro).</p>}
          <div className="mt-5 flex flex-wrap gap-3">
            <BotonLink href={conAviso("/mi-cuenta/pagar/transferir")} className="min-w-40 text-base">
              <Landmark size={20} aria-hidden="true" /> Pagar
            </BotonLink>
            <BotonLink href={conAviso("/mi-cuenta/pagar/informar")} variante="secundario">
              <Send size={18} aria-hidden="true" /> Ya realicé la transferencia
            </BotonLink>
          </div>
        </Card>
        <Card>
          <h2 className="mb-2 font-bold">Pagos informados</h2>
          {enVerificacion.cantidad > 0 ? (
            <p className="text-sm">
              Tienes <strong>{enVerificacion.cantidad}</strong> transferencia{enVerificacion.cantidad === 1 ? "" : "s"} por{" "}
              <strong className="tabular-nums">{$(enVerificacion.monto)}</strong> pendiente{enVerificacion.cantidad === 1 ? "" : "s"} de verificación.
              Tu saldo se actualiza cuando la administración las verifica.
            </p>
          ) : (
            <p className="text-sm text-texto-suave">No tienes transferencias pendientes de verificación.</p>
          )}
          <p className="mt-3 text-xs text-texto-suave">
            Convive no procesa pagos: la transferencia la haces desde tu banco, a la cuenta de tu comunidad.
          </p>
        </Card>
      </section>

      <section aria-labelledby="pendientes" className="mb-8">
        <h2 id="pendientes" className="mb-3 text-lg font-bold">
          Obligaciones pendientes
        </h2>
        {pendientes.length === 0 ? (
          <Vacio>No hay avisos de cobro con saldo pendiente.</Vacio>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {pendientes.map((a) => {
              const vencido = a.vencimiento < ahora;
              const pagado = Number(a.total) - Number(a.saldo);
              return (
                <li key={a.id} className={`sombra-convive rounded-2xl border bg-white p-4 ${escaneado?.id === a.id ? "border-convive" : "border-borde"}`}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="font-bold">{nombrePeriodo(a.periodo.anio, a.periodo.mes)}</span>
                    {vencido ? <Insignia tono="peligro">Vencido</Insignia> : <Insignia tono="alerta">Por pagar</Insignia>}
                  </div>
                  <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
                    <dt className="text-texto-suave">Gasto común</dt>
                    <dd className="text-right tabular-nums">{$(a.gastoComun)}</dd>
                    <dt className="text-texto-suave">Fondo de reserva</dt>
                    <dd className="text-right tabular-nums">{$(a.fondoReserva)}</dd>
                    {Number(a.cargos) > 0 && (
                      <>
                        <dt className="text-texto-suave">Otros cargos</dt>
                        <dd className="text-right tabular-nums">{$(a.cargos)}</dd>
                      </>
                    )}
                    {Number(a.interes) > 0 && (
                      <>
                        <dt className="text-texto-suave">Intereses por mora</dt>
                        <dd className="text-right tabular-nums">{$(a.interes)}</dd>
                      </>
                    )}
                    <dt className="border-t border-borde pt-1 font-semibold">Total del aviso</dt>
                    <dd className="border-t border-borde pt-1 text-right font-semibold tabular-nums">{$(a.total)}</dd>
                    {pagado > 0 && (
                      <>
                        <dt className="text-texto-suave">Pagado</dt>
                        <dd className="text-right tabular-nums">-{$(pagado)}</dd>
                      </>
                    )}
                    <dt className="font-bold">Pendiente</dt>
                    <dd className={`text-right font-bold tabular-nums ${vencido ? "text-peligro" : ""}`}>{$(a.saldo)}</dd>
                  </dl>
                  <p className="mt-2 flex items-center justify-between text-sm text-texto-suave">
                    Vence el {formatoFecha(a.vencimiento)}
                    <a href={`/avisos/${a.id}/pdf`} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center font-semibold text-marca">
                      Ver aviso (PDF)
                    </a>
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="informadas" className="mb-8">
        <h2 id="informadas" className="mb-3 text-lg font-bold">
          Estado de mis transferencias informadas
        </h2>
        {transferencias.length === 0 ? (
          <Vacio>Todavía no has informado transferencias para esta unidad.</Vacio>
        ) : (
          <ul className="space-y-2">
            {transferencias.map((t) => {
              const e = ESTADOS_TRANSFERENCIA[t.estado];
              return (
                <li key={t.id} className="sombra-convive rounded-2xl border border-borde bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold tabular-nums">
                      {$(t.monto)} <span className="font-normal text-texto-suave">· transferida el {formatoFecha(t.fecha)}</span>
                    </span>
                    <Insignia tono={e.tono}>{e.texto}</Insignia>
                  </div>
                  <p className="mt-1 text-sm text-texto-suave">{e.residente}</p>
                  {t.estado === "RECHAZADA" && t.nota && <p className="mt-1 text-sm"><strong>Motivo:</strong> {t.nota}</p>}
                  {t.estado === "CONCILIADA" && t.nota && <p className="mt-1 text-sm">{t.nota}</p>}
                  <p className="mt-1 text-xs text-texto-suave">
                    Informada el {formatoFechaHora(t.creadoEn)}
                    {t.operacion && ` · operación ${t.operacion}`}
                    {t.comprobante && (
                      <>
                        {" · "}
                        <a href={`/comprobantes/${t.id}`} target="_blank" rel="noopener" className="font-semibold text-marca">
                          ver comprobante
                        </a>
                      </>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="pagos">
        <h2 id="pagos" className="mb-3 text-lg font-bold">
          Pagos anteriores
        </h2>
        {estado.pagos.length === 0 ? (
          <Vacio>Sin pagos registrados.</Vacio>
        ) : (
          <ul className="divide-y divide-borde sombra-convive rounded-2xl border border-borde bg-white">
            {estado.pagos.slice(0, 12).map((p) => (
              <li key={p.id} className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm ${p.anuladoEn ? "text-texto-suave" : ""}`}>
                <span>
                  {formatoFecha(p.fecha)} · {ETIQUETAS_MEDIO_PAGO[p.medio]}
                  {p.anuladoEn && <span className="ml-2"><Insignia tono="peligro">Anulado</Insignia></span>}
                </span>
                <span className={`font-semibold tabular-nums ${p.anuladoEn ? "line-through" : ""}`}>{$(p.monto)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
