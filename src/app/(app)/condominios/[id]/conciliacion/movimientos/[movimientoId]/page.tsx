import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { Card, Insignia, PageHeader, Vacio } from "@/components/ui";
import { ESTADOS_CONCILIACION } from "@/lib/cartolas";
import { nombrePeriodo } from "@/lib/cobro";
import { formatoFecha, formatoFechaHora, formatoMoneda } from "@/lib/formato";
import { puede } from "@/lib/permisos";
import { sugerenciasDeMovimiento } from "@/lib/conciliacion-servicio";
import { condominioVisible } from "../../../condominio-actual";
import { deshacerConciliacionAccion, otroIngresoAccion, registrarPagoDesdeMovimientoAccion, vincularPagoAccion } from "../../../../ingresos-actions";
import { BotonAccion, FormularioNota } from "../../../transferencias/[transferenciaId]/formularios";
import { FormularioOtroIngreso, FormularioPagoUnidad } from "./formularios";

// FIN-COMP A · Conciliar un movimiento de la cartola: a qué corresponde, sugerencias y su historial.

const ETIQUETA_SUGERENCIA = { TRANSFERENCIA: "Transferencia informada", PAGO: "Pago ya registrado", UNIDAD: "Deuda de unidad" } as const;

export default async function MovimientoPage({ params }: PageProps<"/condominios/[id]/conciliacion/movimientos/[movimientoId]">) {
  const { id, movimientoId } = await params;
  const { condominio, usuario, administradoraId, moneda } = await condominioVisible(id);
  const concilia = puede(usuario, "pagos.verificar", id);
  const m = await db.movimientoBancario.findFirst({
    where: { id: movimientoId, condominioId: id, administradoraId },
    include: {
      cuenta: { select: { banco: true, numeroFinal: true } },
      importacion: { select: { id: true, archivoNombre: true, creadoEn: true } },
      conciliaciones: {
        orderBy: { creadoEn: "asc" },
        include: {
          pago: { select: { id: true, fecha: true, anuladoEn: true, unidad: { select: { id: true, numero: true } } } },
          transferencia: { select: { id: true } },
        },
      },
    },
  });
  if (!m) notFound();
  const $ = (n: number | { toString(): string }) => formatoMoneda(n, moneda);
  const monto = Number(m.monto);
  const restante = Math.round((monto - Number(m.montoConciliado)) * 100) / 100;
  const abono = monto > 0;
  const est = ESTADOS_CONCILIACION[m.estado];
  const ahora = new Date();
  const [sug, unidades, historial] = await Promise.all([
    abono && restante > 0 && concilia ? sugerenciasDeMovimiento(m) : null,
    abono && restante > 0 && concilia
      ? db.unidad.findMany({
          where: { condominioId: id, administradoraId },
          select: {
            id: true,
            numero: true,
            avisos: {
              where: { saldo: { gt: 0 } },
              orderBy: [{ vencimiento: "asc" }, { emitidoEn: "asc" }],
              select: { id: true, saldo: true, vencimiento: true, periodo: { select: { anio: true, mes: true } } },
            },
          },
        })
      : [],
    db.registroCambio.findMany({
      where: { condominioId: id, entidad: "ConciliacionMovimiento", entidadId: { in: m.conciliaciones.map((c) => c.id) } },
      orderBy: { creadoEn: "asc" },
      take: 50,
    }),
  ]);
  const sugeridas = new Set((sug?.sugerencias ?? []).filter((s) => s.tipo === "UNIDAD").map((s) => s.unidadId));
  const opcionesUnidad = unidades
    .map((u) => ({
      id: u.id,
      numero: u.numero,
      deuda: u.avisos.reduce((s, a) => s + Number(a.saldo), 0),
      sugerida: sugeridas.has(u.id),
      avisos: u.avisos.map((a) => ({ id: a.id, etiqueta: nombrePeriodo(a.periodo.anio, a.periodo.mes), saldo: Number(a.saldo), vencido: a.vencimiento < ahora })),
    }))
    .sort((a, b) => Number(b.sugerida) - Number(a.sugerida) || a.numero.localeCompare(b.numero, "es", { numeric: true }));
  const unicaUnidad = sug && !sug.ambigua && sug.sugerencias[0]?.tipo === "UNIDAD" ? sug.sugerencias[0].unidadId : undefined;
  const base = `/condominios/${id}/conciliacion`;

  return (
    <>
      <Link href={`${base}/movimientos`} className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-marca">
        <ArrowLeft size={16} aria-hidden="true" /> Movimientos bancarios
      </Link>
      <PageHeader
        titulo={`${abono ? "Abono" : "Cargo"} de ${$(Math.abs(monto))} · ${formatoFecha(m.fecha)}`}
        descripcion={`${condominio.nombre} · ${m.cuenta.banco} ···${m.cuenta.numeroFinal}`}
        acciones={<Insignia tono={est.tono}>{est.texto}</Insignia>}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 font-bold">Lo que dice la cartola</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-texto-suave">Fecha</dt>
              <dd>{formatoFecha(m.fecha)}</dd>
              <dt className="text-texto-suave">Monto</dt>
              <dd className="font-semibold tabular-nums">{$(monto)}</dd>
              <dt className="text-texto-suave">Descripción</dt>
              <dd>{m.descripcion ?? "—"}</dd>
              <dt className="text-texto-suave">Referencia</dt>
              <dd>{m.referencia ?? "—"}</dd>
              <dt className="text-texto-suave">Emisor</dt>
              <dd>{[m.contraparte, m.rutContraparte].filter(Boolean).join(" · ") || "—"}</dd>
              <dt className="text-texto-suave">Archivo</dt>
              <dd>
                <Link href={`${base}/importaciones/${m.importacion.id}`} className="text-marca hover:underline">
                  {m.importacion.archivoNombre}
                </Link>
                {m.fila ? `, fila ${m.fila}` : ""}
              </dd>
            </dl>
          </Card>
          <Card>
            <h2 className="mb-3 font-bold">A qué corresponde</h2>
            <dl className="mb-3 grid grid-cols-[1fr_auto] gap-y-1 text-sm">
              <dt className="text-texto-suave">Conciliado</dt>
              <dd className="text-right font-semibold tabular-nums">{$(Number(m.montoConciliado))}</dd>
              <dt className="text-texto-suave">Por identificar</dt>
              <dd className="text-right font-semibold tabular-nums">{$(restante)}</dd>
            </dl>
            {m.conciliaciones.length === 0 ? (
              <p className="text-sm text-texto-suave">Todavía no se ha asociado a ningún registro. Importarlo no crea pagos por sí solo.</p>
            ) : (
              <ul className="space-y-3">
                {m.conciliaciones.map((c) => (
                  <li key={c.id} className={`rounded-xl border p-3 text-sm ${c.anuladaEn ? "border-borde bg-fondo text-texto-suave" : "border-exito/30"}`}>
                    <p className="font-semibold">
                      <span className={c.anuladaEn ? "line-through" : ""}>{$(c.monto)}</span> ·{" "}
                      {c.tipo === "PAGO" && c.pago ? (
                        <>
                          pago de la{" "}
                          <Link href={`/condominios/${id}/unidades/${c.pago.unidad.id}`} className="text-marca hover:underline">
                            unidad {c.pago.unidad.numero}
                          </Link>
                          {c.transferencia && concilia && (
                            <>
                              {" "}(
                              <Link href={`/condominios/${id}/transferencias/${c.transferencia.id}`} className="text-marca hover:underline">
                                transferencia informada
                              </Link>
                              )
                            </>
                          )}
                        </>
                      ) : (
                        <>otro ingreso: {c.concepto}</>
                      )}
                    </p>
                    <p className="text-xs text-texto-suave">
                      {c.creadoPor} · {formatoFechaHora(c.creadoEn)}
                      {c.anuladaEn && ` · deshecha por ${c.anuladaPor} el ${formatoFechaHora(c.anuladaEn)}: ${c.motivoAnulacion}`}
                    </p>
                    {!c.anuladaEn && concilia && !c.transferencia && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs font-semibold text-peligro">Deshacer (se eligió mal)</summary>
                        <p className="my-2 text-xs text-texto-suave">
                          {c.tipo === "PAGO" ? "El pago NO se anula: sigue en Recaudación, pero queda sin movimiento bancario. " : ""}
                          Queda en el historial con el motivo.
                        </p>
                        <FormularioNota accion={deshacerConciliacionAccion.bind(null, id, m.id, c.id)} boton="Deshacer conciliación" variante="peligro" ayuda="Motivo" />
                      </details>
                    )}
                    {!c.anuladaEn && c.transferencia && (
                      <p className="mt-1 text-xs text-texto-suave">Viene de una transferencia informada: si no corresponde, se reversa desde la transferencia.</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {historial.length > 0 && (
            <Card>
              <h2 className="mb-3 font-bold">Historial</h2>
              <ol className="space-y-2 text-sm">
                {historial.map((h) => (
                  <li key={h.id} className="border-l-2 border-convive/40 pl-3">
                    <span className="font-semibold">{h.accion}</span> · {h.usuarioNombre}
                    <span className="block text-xs text-texto-suave">{formatoFechaHora(h.creadoEn)} · {h.detalle}</span>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {!abono && (
            <Card>
              <p className="text-sm text-texto-suave">Los cargos (egresos) se asocian a gastos y proveedores en la Entrega B.</p>
            </Card>
          )}
          {abono && restante <= 0 && (
            <Card className="border-exito/30">
              <p className="text-sm">Este abono ya está conciliado completo.</p>
            </Card>
          )}
          {abono && restante > 0 && !concilia && (
            <Card>
              <p className="text-sm text-texto-suave">Tu perfil puede consultar la conciliación, pero no conciliar.</p>
            </Card>
          )}
          {sug && (
            <Card>
              <h2 className="mb-1 font-bold">Sugerencias</h2>
              {sug.ambigua && sug.sugerencias.length > 0 && (
                <p className="mb-3 rounded-xl bg-alerta-suave px-3 py-2 text-sm text-alerta">
                  Hay más de una posibilidad o ninguna clara. Revisa antes de confirmar: Convive no decide solo.
                </p>
              )}
              {sug.sugerencias.length === 0 ? (
                <Vacio>No encontramos transferencias informadas, pagos registrados ni unidades que coincidan. Puedes asignarlo a mano más abajo.</Vacio>
              ) : (
                <ul className="space-y-3">
                  {sug.sugerencias.map((s) => (
                    <li key={`${s.tipo}-${s.id}`} className="rounded-xl border border-borde p-3">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                        {ETIQUETA_SUGERENCIA[s.tipo]} · unidad {s.unidad} · {$(s.monto)}
                        {s.fuerte ? <Insignia tono="marca">Coincidencia fuerte</Insignia> : <Insignia>Posible</Insignia>}
                      </p>
                      <p className="mb-2 text-xs text-texto-suave">{s.motivos.join(" · ")}</p>
                      {s.tipo === "TRANSFERENCIA" && (
                        <Link href={`/condominios/${id}/transferencias/${s.id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-marca">
                          Revisar y confirmar la transferencia →
                        </Link>
                      )}
                      {s.tipo === "PAGO" && (
                        <BotonAccion
                          accion={vincularPagoAccion.bind(null, id, m.id, s.id)}
                          texto="Vincular este pago"
                          confirmar="Revisé que este abono es el pago ya registrado (no se creará otro ingreso)."
                        />
                      )}
                      {s.tipo === "UNIDAD" && <p className="text-xs text-texto-suave">Para registrarlo, elige esta unidad en «Registrar el pago de una unidad».</p>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          {abono && restante > 0 && concilia && (
            <>
              <Card>
                <h2 className="mb-1 font-bold">Registrar el pago de una unidad</h2>
                <p className="mb-3 text-sm text-texto-suave">
                  Úsalo cuando el abono es un pago que nadie informó ni registró. Se crea UN pago en Recaudación con fecha {formatoFecha(m.fecha)} y queda conciliado.
                  Si el abono cubre a varias unidades, registra una por una con su monto.
                </p>
                <FormularioPagoUnidad accion={registrarPagoDesdeMovimientoAccion.bind(null, id, m.id)} unidades={opcionesUnidad} restante={restante} inicial={unicaUnidad} />
              </Card>
              <Card>
                <h2 className="mb-1 font-bold">Otro ingreso de la comunidad</h2>
                <p className="mb-3 text-sm text-texto-suave">Para ingresos que no son pagos de una unidad (arriendos, intereses, devoluciones). No cambia la deuda de nadie.</p>
                <FormularioOtroIngreso accion={otroIngresoAccion.bind(null, id, m.id)} restante={restante} />
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  );
}
