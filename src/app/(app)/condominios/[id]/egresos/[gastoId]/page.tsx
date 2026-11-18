import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Paperclip } from "lucide-react";
import { db } from "@/lib/db";
import { Card, Campo, Input, Insignia, PageHeader, Select } from "@/components/ui";
import { FormularioSimple } from "@/components/formulario-simple";
import { ETIQUETAS_MEDIO_PAGO, formatoFecha, formatoFechaHora, formatoMoneda, hoyISO } from "@/lib/formato";
import { nombrePeriodo } from "@/lib/cobro";
import { puede } from "@/lib/permisos";
import { condominioVisible } from "../../condominio-actual";
import { anularPagoEgresoAccion, pagarEgresoAccion, subirRespaldoAccion } from "../../../egresos-actions";
import { FormularioNota } from "../../transferencias/[transferenciaId]/formularios";

// FIN-COMP · Entrega B · Ficha de un egreso: pago al proveedor, respaldos y conciliación bancaria.

export default async function EgresoPage({ params }: PageProps<"/condominios/[id]/egresos/[gastoId]">) {
  const { id, gastoId } = await params;
  const { condominio, usuario, administradoraId, moneda } = await condominioVisible(id);
  const gestiona = puede(usuario, "pagos.verificar", id);
  const g = await db.gasto.findFirst({
    where: { id: gastoId, administradoraId, periodo: { condominioId: id } },
    include: {
      periodo: { select: { id: true, anio: true, mes: true, estado: true } },
      unidad: { select: { numero: true } },
      fondo: { select: { nombre: true } },
      proveedorRef: { select: { nombre: true, rut: true } },
      respaldos: { orderBy: { creadoEn: "asc" }, select: { id: true, nombre: true, tamano: true, subidoPor: true, creadoEn: true } },
      conciliaciones: {
        orderBy: { creadoEn: "asc" },
        include: { movimiento: { select: { id: true, fecha: true, monto: true, descripcion: true, cuenta: { select: { banco: true, numeroFinal: true } } } } },
      },
    },
  });
  if (!g) notFound();
  const $ = (n: number | { toString(): string }) => formatoMoneda(n, moneda);
  const vigente = g.conciliaciones.find((c) => !c.anuladaEn);
  return (
    <>
      <Link href={`/condominios/${id}/egresos`} className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-marca">
        <ArrowLeft size={16} aria-hidden="true" /> Egresos
      </Link>
      <PageHeader
        titulo={`${g.descripcion} · ${$(g.monto)}`}
        descripcion={`${condominio.nombre} · ${g.tipo === "COMUN" ? "Gasto común" : `Cargo a la unidad ${g.unidad?.numero}`} de ${nombrePeriodo(g.periodo.anio, g.periodo.mes)}`}
        acciones={g.estadoPago === "PAGADO" ? <Insignia tono="exito">Pagado</Insignia> : <Insignia tono="alerta">Por pagar</Insignia>}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 font-bold">Datos</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-texto-suave">Categoría</dt>
              <dd>{g.categoria}</dd>
              <dt className="text-texto-suave">Proveedor</dt>
              <dd>{g.proveedorRef ? `${g.proveedorRef.nombre}${g.proveedorRef.rut ? ` · ${g.proveedorRef.rut}` : ""} (catálogo)` : (g.proveedor ?? "—")}</dd>
              <dt className="text-texto-suave">N° documento</dt>
              <dd>{g.documento ?? "—"}</dd>
              <dt className="text-texto-suave">Fecha del gasto</dt>
              <dd>{formatoFecha(g.fecha)}</dd>
              <dt className="text-texto-suave">Se financia con</dt>
              <dd>{g.fondo ? `${g.fondo.nombre} (no se reparte entre las unidades)` : g.tipo === "COMUN" ? "Gasto común del mes (se reparte)" : "Cargo a la unidad"}</dd>
            </dl>
          </Card>
          <Card>
            <h2 className="mb-3 font-bold">Pago al proveedor</h2>
            {g.estadoPago === "PAGADO" ? (
              <>
                <p className="mb-3 text-sm">
                  Pagado el <strong>{g.fechaPago ? formatoFecha(g.fechaPago) : "—"}</strong>
                  {g.medioPago && ` por ${ETIQUETAS_MEDIO_PAGO[g.medioPago].toLowerCase()}`}
                  {g.pagadoPor && ` · registrado por ${g.pagadoPor}`}.
                </p>
                {gestiona && !vigente && (
                  <FormularioNota accion={anularPagoEgresoAccion.bind(null, id, g.id)} boton="Volver a «por pagar»" variante="secundario" ayuda="¿Se registró por error? Explica por qué" />
                )}
              </>
            ) : gestiona ? (
              <FormularioSimple accion={pagarEgresoAccion.bind(null, id, g.id)} boton="Registrar pago" variante="primario">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo etiqueta="Fecha de pago">
                    <Input name="fechaPago" type="date" defaultValue={hoyISO()} required />
                  </Campo>
                  <Campo etiqueta="Medio">
                    <Select name="medioPago" defaultValue="TRANSFERENCIA">
                      {Object.entries(ETIQUETAS_MEDIO_PAGO).map(([v, t]) => (
                        <option key={v} value={v}>
                          {t}
                        </option>
                      ))}
                    </Select>
                  </Campo>
                </div>
                <p className="text-xs text-texto-suave">Si pagas por transferencia, después concílialo con el cargo de la cartola.</p>
              </FormularioSimple>
            ) : (
              <p className="text-sm text-texto-suave">Por pagar.</p>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 font-bold">Respaldos</h2>
            {g.respaldos.length === 0 ? (
              <p className="mb-3 text-sm text-texto-suave">Sin respaldo. Adjunta la factura, boleta o comprobante de pago.</p>
            ) : (
              <ul className="mb-3 space-y-1 text-sm">
                {g.respaldos.map((r) => (
                  <li key={r.id}>
                    <a href={`/condominios/${id}/egresos/${g.id}/respaldos/${r.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-semibold text-marca">
                      <Paperclip size={14} aria-hidden="true" /> {r.nombre}
                    </a>{" "}
                    <span className="text-texto-suave">
                      ({Math.round(r.tamano / 1024)} KB) · {r.subidoPor}, {formatoFechaHora(r.creadoEn)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {gestiona && (
              <FormularioSimple accion={subirRespaldoAccion.bind(null, id, g.id)} boton="Adjuntar respaldo" multipart>
                <Campo etiqueta="Archivo (PDF o imagen, máximo 900 KB)">
                  <Input name="respaldo" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required />
                </Campo>
              </FormularioSimple>
            )}
          </Card>
          <Card>
            <h2 className="mb-3 font-bold">Banco</h2>
            {vigente ? (
              <p className="text-sm">
                Conciliado con el{" "}
                <Link href={`/condominios/${id}/conciliacion/movimientos/${vigente.movimiento.id}`} className="font-semibold text-marca hover:underline">
                  cargo del {formatoFecha(vigente.movimiento.fecha)} por {$(Math.abs(Number(vigente.movimiento.monto)))}
                </Link>{" "}
                ({vigente.movimiento.cuenta.banco} ···{vigente.movimiento.cuenta.numeroFinal}).
              </p>
            ) : (
              <p className="text-sm text-texto-suave">
                Sin movimiento bancario. Se concilia desde el cargo, en{" "}
                <Link href={`/condominios/${id}/conciliacion/movimientos?tipo=cargo`} className="font-semibold text-marca">
                  Movimientos
                </Link>
                .
              </p>
            )}
            {g.conciliaciones.some((c) => c.anuladaEn) && (
              <p className="mt-2 text-xs text-texto-suave">Tiene {g.conciliaciones.filter((c) => c.anuladaEn).length} conciliación(es) deshecha(s) en su historial.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
