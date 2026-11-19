import Link from "next/link";
import { notFound } from "next/navigation";
import { Paperclip } from "lucide-react";
import { db } from "@/lib/db";
import { Boton, BotonLink, Card, Insignia, PageHeader, Tabla, Vacio } from "@/components/ui";
import { formatoFecha, formatoMoneda } from "@/lib/formato";
import { buscarCoincidencias, ESTADOS_ABIERTOS, ESTADOS_TRANSFERENCIA } from "@/lib/pagos";
import { filtroCondominios, puede } from "@/lib/permisos";
import type { EstadoTransferencia, Prisma } from "@/generated/prisma/client";
import { RESULTADOS_AUTO } from "@/lib/verificacion-automatica";
import { condominioVisible } from "../condominio-actual";
import { confirmarSugerenciaAccion } from "../../transferencias-actions";
import { BotonServidor } from "../conciliacion/formularios";
import { ElegirComunidadTransferencias } from "./filtros";

// PAG-001 · Cobranza → Transferencias informadas por los residentes, con el posible movimiento de
// la cartola que les corresponde. Desde aquí se abre cada una para verificarla.

const ESTADOS = Object.keys(ESTADOS_TRANSFERENCIA) as EstadoTransferencia[];
const fechaValida = (s: unknown) => (typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null);

export default async function TransferenciasPage({ params, searchParams }: PageProps<"/condominios/[id]/transferencias">) {
  const { id } = await params;
  const sp = await searchParams;
  const { condominio, usuario, administradoraId, moneda } = await condominioVisible(id);
  if (!puede(usuario, "pagos.verificar", id)) notFound();
  const $ = (n: number | { toString(): string }) => formatoMoneda(n, moneda);

  const estado = typeof sp.estado === "string" && (ESTADOS as string[]).includes(sp.estado) ? (sp.estado as EstadoTransferencia) : sp.estado === "todas" ? null : "abiertas";
  const desde = fechaValida(sp.desde);
  const hasta = fechaValida(sp.hasta);
  // VER-001: filtro por resultado de la verificación automática (?auto=POR_CONFIRMAR, CON_DIFERENCIAS o todas).
  const auto = sp.auto === "POR_CONFIRMAR" || sp.auto === "CON_DIFERENCIAS" ? sp.auto : sp.auto === "todas" ? "todas" : null;
  const where: Prisma.TransferenciaInformadaWhereInput = {
    condominioId: id,
    administradoraId,
    ...(auto
      ? { estado: "EN_REVISION", autoResultado: auto === "todas" ? { in: ["POR_CONFIRMAR", "CON_DIFERENCIAS"] } : auto }
      : estado === "abiertas" ? { estado: { in: ESTADOS_ABIERTOS } } : estado ? { estado } : {}),
    ...(desde || hasta ? { fecha: { ...(desde ? { gte: desde } : {}), ...(hasta ? { lte: hasta } : {}) } } : {}),
  };

  const [comunidades, transferencias, conteo, cuentaPublicada, porAuto] = await Promise.all([
    db.condominio.findMany({ where: { administradoraId, ...filtroCondominios(usuario) }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
    db.transferenciaInformada.findMany({
      where,
      orderBy: [{ creadoEn: "desc" }],
      take: 200,
      include: { unidad: { select: { numero: true } }, comprobante: { select: { id: true } }, movimiento: { select: { fecha: true, monto: true } } },
    }),
    db.transferenciaInformada.groupBy({ by: ["estado"], where: { condominioId: id, administradoraId }, _count: true }),
    db.cuentaBancaria.count({ where: { condominioId: id, administradoraId, recibePagos: true, verificadaEn: { not: null } } }),
    db.transferenciaInformada.groupBy({ by: ["autoResultado"], where: { condominioId: id, administradoraId, estado: "EN_REVISION", autoResultado: { not: null } }, _count: true }),
  ]);
  const cuentaAuto = (r: "POR_CONFIRMAR" | "CON_DIFERENCIAS") => porAuto.find((p) => p.autoResultado === r)?._count ?? 0;
  const sugeridos = new Map(
    (
      await db.movimientoBancario.findMany({
        where: { id: { in: transferencias.flatMap((t) => (t.autoMovimientoId && t.estado === "EN_REVISION" ? [t.autoMovimientoId] : [])) }, condominioId: id },
        select: { id: true, fecha: true, monto: true, montoConciliado: true },
      })
    ).map((m) => [m.id, m]),
  );

  // Posibles movimientos: una sola consulta para todas las abiertas, y la comparación en memoria.
  const abiertas = transferencias.filter((t) => ESTADOS_ABIERTOS.includes(t.estado));
  const fechas = abiertas.map((t) => t.fecha.getTime());
  const movimientos = abiertas.length
    ? await db.movimientoBancario.findMany({
        where: {
          condominioId: id,
          administradoraId,
          monto: { gt: 0 },
          fecha: { gte: new Date(Math.min(...fechas) - 10 * 86_400_000), lte: new Date(Math.max(...fechas) + 10 * 86_400_000) },
        },
        take: 3000,
      })
    : [];
  const candidatos = movimientos.map((m) => ({
    id: m.id,
    fecha: m.fecha,
    monto: Number(m.monto),
    montoConciliado: Number(m.montoConciliado),
    descripcion: m.descripcion,
    referencia: m.referencia,
    contraparte: m.contraparte,
  }));
  const sugerencia = new Map(
    abiertas.map((t) => {
      const r = buscarCoincidencias({ fecha: t.fecha, monto: Number(t.monto), operacion: t.operacion }, candidatos);
      return [t.id, r] as const;
    }),
  );
  const cuenta = (e: EstadoTransferencia) => conteo.find((c) => c.estado === e)?._count ?? 0;
  const base = `/condominios/${id}/transferencias`;
  const filtro = (e: string) => `${base}?estado=${e}${sp.desde ? `&desde=${sp.desde}` : ""}${sp.hasta ? `&hasta=${sp.hasta}` : ""}`;

  return (
    <>
      <PageHeader
        titulo="Transferencias informadas"
        descripcion={`${condominio.nombre} · Pagos que los residentes dicen haber hecho. No cuentan como pago hasta verificarlos con la cartola.`}
        acciones={
          <>
            <BotonLink href={`/condominios/${id}/conciliacion`} variante="secundario">
              Cargar cartola
            </BotonLink>
            <BotonLink href={`/condominios/${id}/datos-pago`} variante="secundario">
              Datos para transferir
            </BotonLink>
          </>
        }
      />
      {cuentaPublicada === 0 && (
        <p className="mb-4 rounded-xl bg-alerta-suave px-3 py-2 text-sm text-alerta">
          Los residentes todavía no ven datos para transferir. <Link href={`/condominios/${id}/datos-pago`} className="font-semibold underline">Configúralos aquí.</Link>
        </p>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {(["INFORMADA", "EN_REVISION", "CONCILIADA", "RECHAZADA", "ANULADA"] as const).map((e) => (
          <Link key={e} href={filtro(e)} className={`rounded-2xl border bg-white p-4 hover:border-convive ${estado === e ? "border-marca ring-2 ring-convive/30" : "border-borde"}`}>
            <span className="block text-sm text-texto-suave">{ESTADOS_TRANSFERENCIA[e].texto}</span>
            <span className="text-2xl font-bold tabular-nums">{cuenta(e)}</span>
          </Link>
        ))}
      </div>

      {(cuentaAuto("POR_CONFIRMAR") > 0 || cuentaAuto("CON_DIFERENCIAS") > 0 || auto) && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-borde bg-white p-3 text-sm">
          <span className="font-semibold">Verificación automática:</span>
          {(["POR_CONFIRMAR", "CON_DIFERENCIAS"] as const).map((r) => (
            <Link key={r} href={`${base}?auto=${r}`} className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 ${auto === r ? "border-marca ring-2 ring-convive/30" : "border-borde"}`}>
              <Insignia tono={RESULTADOS_AUTO[r].tono}>{cuentaAuto(r)}</Insignia> {RESULTADOS_AUTO[r].texto}
            </Link>
          ))}
          {auto && (
            <Link href={base} className="inline-flex min-h-11 items-center px-2 font-semibold text-marca">
              Quitar filtro
            </Link>
          )}
        </div>
      )}

      <Card className="mb-6">
        <form className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
          <ElegirComunidadTransferencias actual={id} comunidades={comunidades} />
          <label className="block text-sm">
            <span className="mb-1 block font-semibold">Estado</span>
            <select name="estado" defaultValue={estado ?? "todas"} className="min-h-11 w-full rounded-xl border border-borde bg-white px-3 py-2">
              <option value="abiertas">Por revisar (informadas y en revisión)</option>
              <option value="todas">Todas</option>
              {ESTADOS.map((e) => (
                <option key={e} value={e}>
                  {ESTADOS_TRANSFERENCIA[e].texto}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold">Transferidas desde</span>
            <input type="date" name="desde" defaultValue={typeof sp.desde === "string" ? sp.desde : ""} className="min-h-11 w-full rounded-xl border border-borde bg-white px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold">Hasta</span>
            <input type="date" name="hasta" defaultValue={typeof sp.hasta === "string" ? sp.hasta : ""} className="min-h-11 w-full rounded-xl border border-borde bg-white px-3 py-2" />
          </label>
          <Boton type="submit" variante="secundario">
            Filtrar
          </Boton>
        </form>
      </Card>

      {transferencias.length === 0 ? (
        <Vacio>No hay transferencias informadas con estos filtros.</Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th>Unidad</th>
              <th>Informó</th>
              <th>Transferida</th>
              <th className="text-right">Monto</th>
              <th>Referencia</th>
              <th>Estado</th>
              <th>Posible movimiento</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {transferencias.map((t) => {
              const s = sugerencia.get(t.id);
              const mejor = s?.coincidencias[0];
              return (
                <tr key={t.id}>
                  <td className="font-semibold">{t.unidad.numero}</td>
                  <td>
                    {t.informante}
                    {t.pagadoPor && <span className="block text-xs text-texto-suave">Pagó: {t.pagadoPor}</span>}
                  </td>
                  <td className="whitespace-nowrap">{formatoFecha(t.fecha)}</td>
                  <td className="text-right font-semibold tabular-nums">{$(t.monto)}</td>
                  <td className="text-texto-suave">
                    {t.operacion ?? "—"}
                    {t.comprobante && (
                      <a href={`/comprobantes/${t.id}`} target="_blank" rel="noopener" className="ml-2 inline-flex items-center gap-1 text-marca" title="Ver comprobante">
                        <Paperclip size={14} aria-hidden="true" />
                        <span className="sr-only">Ver comprobante</span>
                      </a>
                    )}
                  </td>
                  <td>
                    <Insignia tono={ESTADOS_TRANSFERENCIA[t.estado].tono}>{ESTADOS_TRANSFERENCIA[t.estado].texto}</Insignia>
                    {t.autoResultado === "VERIFICADA" && t.estado === "CONCILIADA" && <span className="mt-1 block text-xs text-texto-suave">Verificada sola con la cartola</span>}
                  </td>
                  <td className="text-sm">
                    {t.estado === "EN_REVISION" && t.autoResultado && t.autoMovimientoId && sugeridos.get(t.autoMovimientoId) ? (
                      <div className="space-y-2">
                        <span className="block">
                          {formatoFecha(sugeridos.get(t.autoMovimientoId)!.fecha)} · {$(sugeridos.get(t.autoMovimientoId)!.monto)}{" "}
                          <Insignia tono={RESULTADOS_AUTO[t.autoResultado].tono}>{RESULTADOS_AUTO[t.autoResultado].texto}</Insignia>
                        </span>
                        {t.autoMotivos && <span className="block text-xs text-texto-suave">{t.autoMotivos}</span>}
                        {t.autoResultado === "POR_CONFIRMAR" && (
                          <BotonServidor accion={confirmarSugerenciaAccion.bind(null, id, t.id)} variante="primario" pendienteTexto="Confirmando…">
                            Confirmar
                          </BotonServidor>
                        )}
                      </div>
                    ) : t.estado === "CONCILIADA" && t.movimiento ? (
                      <span className="text-exito">
                        {formatoFecha(t.movimiento.fecha)} · {$(t.movimiento.monto)}
                      </span>
                    ) : !s ? (
                      "—"
                    ) : !mejor ? (
                      <span className="text-texto-suave">Sin coincidencias en cartolas cargadas</span>
                    ) : (
                      <span>
                        {formatoFecha(mejor.fecha)} · {$(mejor.restante)}{" "}
                        {s.ambigua ? <Insignia tono="alerta">Revisar</Insignia> : <Insignia tono="marca">Coincide</Insignia>}
                      </span>
                    )}
                  </td>
                  <td className="text-right">
                    <Link href={`${base}/${t.id}`} className="font-semibold text-marca hover:underline">
                      {ESTADOS_ABIERTOS.includes(t.estado) ? "Revisar" : "Ver"}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
