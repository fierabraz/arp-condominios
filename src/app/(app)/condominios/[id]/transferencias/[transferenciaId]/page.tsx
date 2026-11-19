import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Paperclip } from "lucide-react";
import { db } from "@/lib/db";
import { Card, Insignia, PageHeader, Vacio } from "@/components/ui";
import { formatoFecha, formatoFechaHora, formatoMoneda } from "@/lib/formato";
import { nombrePeriodo } from "@/lib/cobro";
import { formatoFolio } from "@/lib/constancias";
import { estadoCuenta } from "@/lib/cobro-servicio";
import { ESTADOS_ABIERTOS, ESTADOS_TRANSFERENCIA } from "@/lib/pagos";
import { puede } from "@/lib/permisos";
import { coincidenciasDe } from "@/lib/transferencias-servicio";
import { RESULTADOS_AUTO } from "@/lib/verificacion-automatica";
import { condominioVisible } from "../../condominio-actual";
import { BotonServidor } from "../../conciliacion/formularios";
import { confirmarSugerenciaAccion } from "../../../transferencias-actions";
import { cambiarEstadoAccion, confirmarTransferenciaAccion, reversarTransferenciaAccion, vincularTransferenciaAccion } from "../../../transferencias-actions";
import { BotonAccion, FormularioConfirmar, FormularioNota } from "./formularios";

// PAG-001 · Revisar una transferencia informada.

export default async function TransferenciaPage({ params }: PageProps<"/condominios/[id]/transferencias/[transferenciaId]">) {
  const { id, transferenciaId } = await params;
  const { condominio, usuario, administradoraId, moneda } = await condominioVisible(id);
  if (!puede(usuario, "pagos.verificar", id)) notFound();
  const t = await db.transferenciaInformada.findFirst({
    where: { id: transferenciaId, condominioId: id, administradoraId },
    include: {
      unidad: { select: { id: true, numero: true } },
      aviso: { select: { periodo: { select: { anio: true, mes: true } } } },
      cuenta: { select: { banco: true, numeroFinal: true } },
      comprobante: { select: { nombre: true, tipo: true, tamano: true } },
      movimiento: { include: { cuenta: { select: { banco: true, numeroFinal: true } } } },
      pago: { select: { id: true, monto: true, fecha: true, anuladoEn: true } },
      constancia: { select: { folio: true, versiones: { orderBy: { version: "asc" }, select: { version: true, estado: true, generadaEn: true } } } },
    },
  });
  if (!t) notFound();
  const $ = (n: number | { toString(): string }) => formatoMoneda(n, moneda);
  const abierta = ESTADOS_ABIERTOS.includes(t.estado);
  const desde = new Date(t.fecha.getTime() - 15 * 86_400_000);
  const hasta = new Date(t.fecha.getTime() + 15 * 86_400_000);
  const [estado, coincidencias, historial, pagosManuales, sugerido] = await Promise.all([
    estadoCuenta(t.unidadId, administradoraId),
    abierta && !t.pagoId ? coincidenciasDe(t) : null,
    db.registroCambio.findMany({ where: { entidad: "TransferenciaInformada", entidadId: t.id }, orderBy: { creadoEn: "asc" } }),
    // FIN-COMP A: pagos de la unidad que la administración ya registró y que no están unidos a otra transferencia.
    abierta && !t.pagoId
      ? db.pago.findMany({
          where: { unidadId: t.unidadId, administradoraId, anuladoEn: null, transferencia: null, fecha: { gte: desde, lte: hasta } },
          orderBy: { fecha: "desc" },
          include: { conciliaciones: { where: { anuladaEn: null }, select: { id: true } } },
          take: 10,
        })
      : [],
    // VER-001: el abono que sugirió la verificación automática.
    abierta && t.autoMovimientoId
      ? db.movimientoBancario.findFirst({ where: { id: t.autoMovimientoId, condominioId: id }, include: { cuenta: { select: { banco: true, numeroFinal: true } } } })
      : null,
  ]);
  const ahora = new Date();
  const avisos = (estado?.avisos ?? [])
    .filter((a) => Number(a.saldo) > 0)
    .sort((a, b) => a.vencimiento.getTime() - b.vencimiento.getTime())
    .map((a) => ({ id: a.id, etiqueta: nombrePeriodo(a.periodo.anio, a.periodo.mes), saldo: Number(a.saldo), vencido: a.vencimiento < ahora }));
  const e = ESTADOS_TRANSFERENCIA[t.estado];
  const base = `/condominios/${id}/transferencias`;

  return (
    <>
      <Link href={base} className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-marca">
        <ArrowLeft size={16} aria-hidden="true" /> Transferencias informadas
      </Link>
      <PageHeader titulo={`Transferencia de ${$(t.monto)} · Unidad ${t.unidad.numero}`} descripcion={condominio.nombre} acciones={<Insignia tono={e.tono}>{e.texto}</Insignia>} />

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 font-bold">Lo que informó el residente</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-texto-suave">Informó</dt>
              <dd>{t.informante} · {formatoFechaHora(t.creadoEn)}</dd>
              {t.pagadoPor && (
                <>
                  <dt className="text-texto-suave">Transfirió</dt>
                  <dd>{t.pagadoPor} (otra persona)</dd>
                </>
              )}
              <dt className="text-texto-suave">Fecha</dt>
              <dd>{formatoFecha(t.fecha)}</dd>
              <dt className="text-texto-suave">Monto</dt>
              <dd className="font-semibold tabular-nums">{$(t.monto)}</dd>
              <dt className="text-texto-suave">Banco de origen</dt>
              <dd>{t.bancoOrigen ?? "—"}</dd>
              <dt className="text-texto-suave">N° de operación</dt>
              <dd>{t.operacion ?? "—"}</dd>
              <dt className="text-texto-suave">Cuenta de destino</dt>
              <dd>{t.cuenta ? `${t.cuenta.banco} ···${t.cuenta.numeroFinal}` : "No había cuenta publicada"}</dd>
              {t.aviso && (
                <>
                  <dt className="text-texto-suave">Desde el aviso</dt>
                  <dd>{nombrePeriodo(t.aviso.periodo.anio, t.aviso.periodo.mes)}</dd>
                </>
              )}
              <dt className="text-texto-suave">Observaciones</dt>
              <dd className="whitespace-pre-line">{t.observaciones ?? "—"}</dd>
              <dt className="text-texto-suave">Comprobante</dt>
              <dd>
                {t.comprobante ? (
                  <a href={`/comprobantes/${t.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-semibold text-marca">
                    <Paperclip size={14} aria-hidden="true" /> {t.comprobante.nombre} ({Math.round(t.comprobante.tamano / 1024)} KB)
                  </a>
                ) : (
                  "No adjuntó"
                )}
              </dd>
            </dl>
            {t.comprobante?.tipo.startsWith("image/") && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/comprobantes/${t.id}`} alt="Comprobante adjuntado por el residente" className="mt-4 max-h-96 rounded-xl border border-borde" />
            )}
            <p className="mt-3 text-xs text-texto-suave">El comprobante sirve de apoyo, pero el pago solo se confirma con el movimiento de la cartola.</p>
          </Card>
          <Card>
            <h2 className="mb-2 font-bold">Constancia de pago {t.constancia ? formatoFolio(t.constancia.folio) : ""}</h2>
            <p className="mb-3 text-sm text-texto-suave">
              Cada cambio de estado agrega una versión con el mismo folio. Las versiones anteriores no se borran. El residente ve las mismas.
            </p>
            <ul className="space-y-1 text-sm">
              {(t.constancia?.versiones ?? []).map((v, i, todas) => (
                <li key={v.version}>
                  <a href={`/comprobantes/${t.id}/constancia?v=${v.version}`} target="_blank" rel="noopener" className="font-semibold text-marca">
                    Versión {v.version}: {ESTADOS_TRANSFERENCIA[v.estado].texto}
                  </a>{" "}
                  <span className="text-texto-suave">· {formatoFechaHora(v.generadaEn)}{i === todas.length - 1 ? " · vigente" : ""}</span>
                </li>
              ))}
              {!t.constancia && (
                <li>
                  <a href={`/comprobantes/${t.id}/constancia`} target="_blank" rel="noopener" className="font-semibold text-marca">
                    Generar constancia (PDF)
                  </a>
                </li>
              )}
            </ul>
          </Card>
          <Card>
            <h2 className="mb-3 font-bold">Cuenta de la unidad</h2>
            <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-sm">
              <dt className="text-texto-suave">Deuda cuando informó</dt>
              <dd className="text-right tabular-nums">{$(t.deudaAlInformar)}</dd>
              <dt className="text-texto-suave">Deuda hoy</dt>
              <dd className="text-right font-semibold tabular-nums">{$(estado?.deuda ?? 0)}</dd>
              <dt className="text-texto-suave">Saldo a favor hoy</dt>
              <dd className="text-right tabular-nums">{$(estado?.aFavor ?? 0)}</dd>
            </dl>
            <Link href={`/condominios/${id}/unidades/${t.unidad.id}`} className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-marca">
              Ver ficha de la unidad
            </Link>
          </Card>
        </div>

        <div className="space-y-6">
          {abierta && t.autoResultado && sugerido && (
            <Card className={t.autoResultado === "CON_DIFERENCIAS" ? "border-peligro/30" : "border-alerta/40"}>
              <h2 className="mb-1 flex flex-wrap items-center gap-2 font-bold">
                Verificación automática <Insignia tono={RESULTADOS_AUTO[t.autoResultado].tono}>{RESULTADOS_AUTO[t.autoResultado].texto}</Insignia>
              </h2>
              <p className="text-sm text-texto-suave">{RESULTADOS_AUTO[t.autoResultado].ayuda}</p>
              <p className="mt-3 text-sm">
                Abono sugerido: <strong>{$(sugerido.monto)}</strong> del {formatoFecha(sugerido.fecha)} ({sugerido.cuenta.banco} ···{sugerido.cuenta.numeroFinal})
                {[sugerido.descripcion, sugerido.referencia].filter(Boolean).length > 0 && <span className="block text-texto-suave">{[sugerido.descripcion, sugerido.referencia].filter(Boolean).join(" · ")}</span>}
              </p>
              {t.autoMotivos && <p className="mt-1 text-sm">{t.autoMotivos}.</p>}
              {t.autoResultado === "POR_CONFIRMAR" && Number(sugerido.montoConciliado) === 0 && (
                <div className="mt-3">
                  <BotonServidor accion={confirmarSugerenciaAccion.bind(null, id, t.id)} variante="primario" pendienteTexto="Confirmando…">
                    Confirmar con este abono ({$(t.monto)}, a la deuda más antigua)
                  </BotonServidor>
                </div>
              )}
              <p className="mt-3 text-xs text-texto-suave">
                {t.autoResultado === "POR_CONFIRMAR"
                  ? "Si no es este abono, elige otro más abajo o deja una nota."
                  : "Puedes confirmar más abajo por el monto que corresponda, o rechazarla con un motivo que el residente verá."}
              </p>
            </Card>
          )}
          {t.estado === "CONCILIADA" && t.movimiento && t.pago && (
            <Card className="border-exito/30">
              <h2 className="mb-2 font-bold text-exito">Verificado y conciliado</h2>
              <p className="text-sm">
                {t.revisadoPor} la confirmó el {formatoFechaHora(t.revisadoEn!)} con el movimiento del {formatoFecha(t.movimiento.fecha)} por{" "}
                {$(t.movimiento.monto)} ({t.movimiento.cuenta.banco} ···{t.movimiento.cuenta.numeroFinal}).
              </p>
              <p className="mt-1 text-sm">
                Se registró un pago de <strong>{$(t.pago.monto)}</strong> el {formatoFecha(t.pago.fecha)} en{" "}
                <Link href={`/condominios/${id}/pagos`} className="font-semibold text-marca underline">Recaudación</Link>.
              </p>
              {t.nota && <p className="mt-1 text-sm text-texto-suave">{t.nota}</p>}
              <details className="mt-4 border-t border-borde pt-3">
                <summary className="cursor-pointer text-sm font-semibold text-peligro">Reversar este pago</summary>
                <p className="my-2 text-sm text-texto-suave">
                  Úsalo solo si el ingreso no corresponde (por ejemplo, el banco devolvió la transferencia). El pago queda anulado (no se borra),
                  la deuda vuelve a los avisos, el movimiento queda libre y la transferencia pasa a «Anulado o reversado». El residente verá el motivo.
                </p>
                <FormularioNota accion={reversarTransferenciaAccion.bind(null, id, t.id)} boton="Reversar pago" variante="peligro" ayuda="Motivo del reverso" />
              </details>
            </Card>
          )}
          {t.estado === "ANULADA" && (
            <Card className="border-peligro/30">
              <h2 className="mb-2 font-bold text-peligro">Anulado o reversado</h2>
              <p className="text-sm">{t.nota}</p>
              <p className="mt-1 text-xs text-texto-suave">{t.revisadoPor} · {t.revisadoEn && formatoFechaHora(t.revisadoEn)}. El pago anulado sigue en Recaudación, tachado.</p>
            </Card>
          )}
          {abierta && t.pago && (
            <Card className="border-alerta/40">
              <h2 className="mb-2 font-bold">Unida a un pago ya registrado</h2>
              <p className="text-sm">
                Corresponde al pago de {$(t.pago.monto)} del {formatoFecha(t.pago.fecha)} que ya está en Recaudación. Falta encontrarlo en la cartola:
                cuando cargues la cartola, concilia ese movimiento desde{" "}
                <Link href={`/condominios/${id}/conciliacion/movimientos?tipo=abono&estado=PENDIENTE`} className="font-semibold text-marca underline">Movimientos bancarios</Link>{" "}
                y esta transferencia quedará verificada sola. No se creará otro ingreso.
              </p>
            </Card>
          )}
          {t.estado === "RECHAZADA" && (
            <Card className="border-peligro/30">
              <h2 className="mb-2 font-bold text-peligro">Rechazada o con diferencias</h2>
              <p className="text-sm">{t.nota}</p>
              <p className="mt-1 text-xs text-texto-suave">{t.revisadoPor} · {t.revisadoEn && formatoFechaHora(t.revisadoEn)}. El residente ve este motivo.</p>
              <div className="mt-4 border-t border-borde pt-4">
                <FormularioNota accion={cambiarEstadoAccion.bind(null, id, t.id, "EN_REVISION")} boton="Volver a revisión" variante="secundario" ayuda="Por qué se vuelve a revisar" />
              </div>
            </Card>
          )}
          {abierta && coincidencias && (
            <>
              <Card>
                <h2 className="mb-1 font-bold">Verificar con la cartola</h2>
                {t.estado === "EN_REVISION" && t.nota && <p className="mb-3 rounded-xl bg-alerta-suave px-3 py-2 text-sm">En revisión: {t.nota}</p>}
                {coincidencias.coincidencias.length === 0 ? (
                  <Vacio>
                    No hay abonos de fecha cercana sin conciliar en las cartolas cargadas. Carga la cartola del período en{" "}
                    <Link href={`/condominios/${id}/conciliacion`} className="font-semibold text-marca underline">Conciliación bancaria</Link> y vuelve aquí.
                    Mientras tanto la transferencia sigue pendiente y la deuda no cambia.
                  </Vacio>
                ) : (
                  <FormularioConfirmar
                    accion={confirmarTransferenciaAccion.bind(null, id, t.id)}
                    montoInformado={Number(t.monto)}
                    deudaActual={estado?.deuda ?? 0}
                    ambigua={coincidencias.ambigua}
                    avisos={avisos}
                    opciones={coincidencias.coincidencias.slice(0, 8).map((c) => ({
                      id: c.id,
                      fecha: formatoFecha(c.fecha),
                      restante: c.restante,
                      monto: c.monto,
                      cuenta: `${c.cuenta.banco} ···${c.cuenta.numeroFinal}`,
                      descripcion: [c.descripcion, c.referencia, c.contraparte].filter(Boolean).join(" · "),
                      motivos: c.motivos,
                      nivel: c.nivel,
                    }))}
                  />
                )}
              </Card>
              {pagosManuales.length > 0 && (
                <Card>
                  <h2 className="mb-1 font-bold">¿Ya registraste este pago a mano?</h2>
                  <p className="mb-3 text-sm text-texto-suave">
                    Pagos de la unidad {t.unidad.numero} en Recaudación con fecha cercana. Si uno de ellos es esta transferencia, vincúlalos: no se crea un segundo ingreso.
                  </p>
                  <ul className="space-y-4">
                    {pagosManuales.map((p) => (
                      <li key={p.id} className="rounded-xl border border-borde p-3">
                        <p className="text-sm font-semibold">
                          {$(p.monto)} · {formatoFecha(p.fecha)} {p.referencia && <span className="font-normal text-texto-suave">· {p.referencia}</span>}
                        </p>
                        <p className="mb-2 text-xs text-texto-suave">{p.conciliaciones.length > 0 ? "Ya conciliado con la cartola." : "Todavía sin movimiento bancario."}</p>
                        <BotonAccion
                          accion={vincularTransferenciaAccion.bind(null, id, t.id, p.id)}
                          texto="Vincular con este pago"
                          confirmar="Revisé que esta transferencia es el mismo pago ya registrado."
                        />
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
              <Card>
                <h2 className="mb-3 font-bold">Si no se puede confirmar</h2>
                <div className="grid gap-6 md:grid-cols-2">
                  {t.estado === "INFORMADA" && !t.pagoId && (
                    <FormularioNota
                      accion={cambiarEstadoAccion.bind(null, id, t.id, "EN_REVISION")}
                      boton="Dejar pendiente de revisión"
                      variante="secundario"
                      ayuda="Qué falta revisar (ej. falta la cartola)"
                    />
                  )}
                  <FormularioNota
                    accion={cambiarEstadoAccion.bind(null, id, t.id, "RECHAZADA")}
                    boton="Rechazar o marcar con diferencias"
                    variante="peligro"
                    ayuda="Motivo (el residente lo verá)"
                  />
                </div>
              </Card>
            </>
          )}
          <Card>
            <h2 className="mb-3 font-bold">Historial</h2>
            {historial.length === 0 ? (
              <p className="text-sm text-texto-suave">Sin movimientos.</p>
            ) : (
              <ol className="space-y-2 text-sm">
                {historial.map((h) => (
                  <li key={h.id} className="border-l-2 border-convive/40 pl-3">
                    <span className="font-semibold">{h.accion}</span> · {h.usuarioNombre}
                    <span className="block text-xs text-texto-suave">{formatoFechaHora(h.creadoEn)} · {h.detalle}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
