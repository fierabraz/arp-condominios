import Link from "next/link";
import { db } from "@/lib/db";
import { nombrePeriodo } from "@/lib/cobro";
import { puede } from "@/lib/permisos";
import { Card, Insignia, PageHeader, Tabla, Vacio } from "@/components/ui";
import { ETIQUETAS_MEDIO_PAGO, formatoFecha, formatoMoneda, hoyISO } from "@/lib/formato";
import { anularPagoConMotivo, nuevoPago } from "../../cobro-actions";
import { condominioVisible } from "../condominio-actual";
import { PagoForm } from "./pago-form";
import { AnularPagoForm } from "./anular-form";

export default async function PagosPage({ params }: PageProps<"/condominios/[id]/pagos">) {
  const { id } = await params;
  const { condominio, editable, moneda, administradoraId, usuario } = await condominioVisible(id);
  const verifica = puede(usuario, "pagos.verificar", id);
  const $ = (n: number | { toString(): string }) => formatoMoneda(n, moneda);

  const [unidades, pagos] = await Promise.all([
    db.unidad.findMany({
      where: { condominioId: id },
      orderBy: { numero: "asc" },
      select: {
        id: true,
        numero: true,
        avisos: {
          where: { saldo: { gt: 0 } },
          orderBy: [{ vencimiento: "asc" }, { emitidoEn: "asc" }],
          select: { id: true, saldo: true, vencimiento: true, periodo: { select: { anio: true, mes: true } } },
        },
      },
    }),
    db.pago.findMany({
      where: { unidad: { condominioId: id } },
      orderBy: [{ fecha: "desc" }, { creadoEn: "desc" }],
      take: 100,
      include: {
        unidad: { select: { numero: true } },
        aplicaciones: { select: { monto: true } },
        conciliaciones: { where: { anuladaEn: null }, select: { movimientoId: true, movimiento: { select: { fecha: true } } } },
        transferencia: { select: { id: true } },
      },
    }),
  ]);
  // FIN-COMP A: pagos informados por residentes que todavía NO son recaudación.
  const enVerificacion = await db.transferenciaInformada.findMany({
    where: { condominioId: id, administradoraId, estado: { in: ["INFORMADA", "EN_REVISION"] } },
    orderBy: { creadoEn: "asc" },
    include: { unidad: { select: { numero: true } } },
  });
  const totalVerificacion = enVerificacion.reduce((s, t) => s + Number(t.monto), 0);
  const ahora = new Date();

  return (
    <>
      <PageHeader
        titulo="Recaudación"
        descripcion={`${condominio.nombre} · Pagos efectivamente registrados. Al registrar uno, Convive propone pagar primero lo más antiguo y puedes elegir otros avisos. Un pago anulado no se borra: queda tachado con su motivo.`}
      />
      {enVerificacion.length > 0 && (
        <Card className="mb-6 border-alerta/40 bg-alerta-suave/40">
          <h2 className="font-bold">
            Pendientes de verificación: {enVerificacion.length} pago{enVerificacion.length === 1 ? "" : "s"} informado{enVerificacion.length === 1 ? "" : "s"} por {$(totalVerificacion)}
          </h2>
          <p className="mt-1 text-sm">
            Los informaron residentes y todavía no se comprueban con la cartola. No están sumados en esta lista ni descuentan deuda.
            Si ya registraste alguno a mano, vincúlalo desde la transferencia (no lo registres otra vez).
          </p>
          <ul className="mt-2 flex flex-wrap gap-2 text-sm">
            {enVerificacion.slice(0, 12).map((t) => (
              <li key={t.id}>
                {verifica ? (
                  <Link href={`/condominios/${id}/transferencias/${t.id}`} className="inline-flex min-h-9 items-center rounded-full border border-borde bg-white px-3 font-semibold text-marca">
                    {t.unidad.numero} · {$(t.monto)}
                  </Link>
                ) : (
                  <span className="inline-flex min-h-9 items-center rounded-full border border-borde bg-white px-3">{t.unidad.numero} · {$(t.monto)}</span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {editable && (
        <Card className="mb-6">
          <h2 className="mb-4 font-medium">Registrar pago</h2>
          <PagoForm
            accion={nuevoPago.bind(null, id)}
            fecha={hoyISO()}
            unidades={unidades
              .map((u) => ({
                id: u.id,
                numero: u.numero,
                deuda: $(u.avisos.reduce((s, a) => s + Number(a.saldo), 0)),
                avisos: u.avisos.map((a) => ({
                  id: a.id,
                  etiqueta: nombrePeriodo(a.periodo.anio, a.periodo.mes),
                  saldo: Number(a.saldo),
                  vencido: a.vencimiento < ahora,
                })),
              }))
              .sort((a, b) => a.numero.localeCompare(b.numero, "es", { numeric: true }))}
          />
        </Card>
      )}
      {pagos.length === 0 ? (
        <Vacio>Aún no hay pagos registrados.</Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Unidad</th>
              <th>Medio</th>
              <th>Referencia</th>
              <th className="text-right">Monto</th>
              <th className="text-right">A favor</th>
              <th>Banco</th>
              {editable && <th></th>}
            </tr>
          </thead>
          <tbody>
            {pagos.map((p) => {
              const anulado = !!p.anuladoEn;
              const aFavor = anulado ? 0 : Number(p.monto) - p.aplicaciones.reduce((s, a) => s + Number(a.monto), 0);
              return (
                <tr key={p.id} className={anulado ? "bg-fondo/60 text-texto-suave" : undefined}>
                  <td className="whitespace-nowrap">{formatoFecha(p.fecha)}</td>
                  <td className="font-medium">{p.unidad.numero}</td>
                  <td>{ETIQUETAS_MEDIO_PAGO[p.medio]}</td>
                  <td className="text-texto-suave">
                    {p.referencia ?? "—"}
                    {anulado && (
                      <span className="mt-1 block text-xs">
                        Anulado el {formatoFecha(p.anuladoEn!)} por {p.anuladoPor}: {p.motivoAnulacion}
                      </span>
                    )}
                  </td>
                  <td className={`text-right tabular-nums ${anulado ? "line-through" : ""}`}>{$(p.monto)}</td>
                  <td className="text-right tabular-nums">{aFavor > 0.004 ? $(aFavor) : "—"}</td>
                  <td className="whitespace-nowrap text-sm">
                    {anulado ? (
                      "—"
                    ) : p.conciliaciones[0] ? (
                      <Insignia tono="exito">Conciliado {formatoFecha(p.conciliaciones[0].movimiento.fecha)}</Insignia>
                    ) : (
                      <span className="text-texto-suave">Sin movimiento bancario</span>
                    )}
                    {p.transferencia && verifica && (
                      <Link href={`/condominios/${id}/transferencias/${p.transferencia.id}`} className="mt-1 block text-xs font-semibold text-marca">
                        Transferencia informada
                      </Link>
                    )}
                  </td>
                  {editable && (
                    <td className="text-right align-top">
                      {anulado ? <Insignia tono="peligro">Anulado o reversado</Insignia> : <AnularPagoForm accion={anularPagoConMotivo.bind(null, p.id)} />}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
