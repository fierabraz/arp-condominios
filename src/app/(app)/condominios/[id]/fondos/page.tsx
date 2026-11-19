import Link from "next/link";
import { db } from "@/lib/db";
import { Card, Campo, Input, PageHeader, Select, Tabla } from "@/components/ui";
import { FormularioSimple } from "@/components/formulario-simple";
import { formatoFecha, formatoMoneda, formatoPorcentaje, hoyISO } from "@/lib/formato";
import { puede } from "@/lib/permisos";
import { saldosFondos } from "@/lib/egresos-servicio";
import { condominioVisible } from "../condominio-actual";
import { crearFondoAccion, movimientoFondoAccion } from "../../egresos-actions";

// FIN-COMP · Entrega B · Fondos de la comunidad. El de reserva se alimenta solo con el % de cada
// aviso emitido; los demás, con aportes registrados. Los egresos pagados con un fondo lo rebajan.

export default async function FondosPage({ params }: PageProps<"/condominios/[id]/fondos">) {
  const { id } = await params;
  const { condominio, usuario, administradoraId, moneda } = await condominioVisible(id);
  const gestiona = puede(usuario, "pagos.verificar", id);
  const saldos = await saldosFondos(id, administradoraId);
  const ids = saldos.map((s) => s.fondo.id);
  const [movimientos, egresos] = await Promise.all([
    db.movimientoFondo.findMany({ where: { fondoId: { in: ids } }, orderBy: [{ fecha: "desc" }, { creadoEn: "desc" }], take: 100 }),
    db.gasto.findMany({ where: { fondoId: { in: ids } }, orderBy: { fecha: "desc" }, take: 100, select: { id: true, fondoId: true, fecha: true, descripcion: true, monto: true } }),
  ]);
  const $ = (x: number | { toString(): string }) => formatoMoneda(x, moneda);
  const total = saldos.reduce((s, f) => s + f.saldo, 0);
  return (
    <>
      <PageHeader titulo="Fondos" descripcion={`${condominio.nombre} · Saldo de cada fondo: aportes menos retiros y egresos pagados con él.`} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <p className="text-sm text-texto-suave">Total en fondos</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{$(total)}</p>
        </Card>
        <Card>
          <p className="text-sm text-texto-suave">Aporte mensual al fondo de reserva</p>
          <p className="mt-1 text-2xl font-semibold">{formatoPorcentaje(condominio.porcentajeReserva, 2)} del gasto común</p>
        </Card>
      </div>
      <div className="space-y-6">
        {saldos.map((s) => {
          const lineas = [
            ...movimientos.filter((m) => m.fondoId === s.fondo.id).map((m) => ({ id: m.id, fecha: m.fecha, detalle: m.descripcion, monto: m.tipo === "APORTE" ? Number(m.monto) : -Number(m.monto), anulado: !!m.anuladoEn, href: undefined as string | undefined })),
            ...egresos.filter((g) => g.fondoId === s.fondo.id).map((g) => ({ id: g.id, fecha: g.fecha, detalle: `Egreso: ${g.descripcion}`, monto: -Number(g.monto), anulado: false, href: `/condominios/${id}/egresos/${g.id}` })),
          ].sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
          return (
            <Card key={s.fondo.id}>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-bold">{s.fondo.nombre}</h2>
                <p className="text-2xl font-bold tabular-nums">{$(s.saldo)}</p>
              </div>
              <dl className="mb-4 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {s.saldoInicial > 0 && (
                  <>
                    <dt className="text-texto-suave">Saldo inicial</dt>
                    <dd className="tabular-nums sm:text-right">{$(s.saldoInicial)}</dd>
                  </>
                )}
                {s.fondo.tipo === "RESERVA" && (
                  <>
                    <dt className="text-texto-suave">Aportes emitidos en los avisos</dt>
                    <dd className="tabular-nums sm:text-right">{$(s.aportesAvisos)}</dd>
                    <dt className="text-texto-suave">De eso, ya recaudado</dt>
                    <dd className="tabular-nums sm:text-right">{$(s.recaudadoAvisos)}</dd>
                  </>
                )}
                <dt className="text-texto-suave">Otros aportes</dt>
                <dd className="tabular-nums sm:text-right">{$(s.aportesManuales)}</dd>
                <dt className="text-texto-suave">Retiros</dt>
                <dd className="tabular-nums sm:text-right">−{$(s.retirosManuales)}</dd>
                <dt className="text-texto-suave">Egresos pagados con el fondo</dt>
                <dd className="tabular-nums sm:text-right">−{$(s.egresos)}</dd>
              </dl>
              {lineas.length > 0 && (
                <Tabla>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Detalle</th>
                      <th className="text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineas.map((l) => (
                      <tr key={l.id} className={l.anulado ? "text-texto-suave line-through" : undefined}>
                        <td className="whitespace-nowrap">{formatoFecha(l.fecha)}</td>
                        <td>{l.href ? <Link href={l.href} className="text-marca hover:underline">{l.detalle}</Link> : l.detalle}</td>
                        <td className="text-right tabular-nums">{$(l.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Tabla>
              )}
              {gestiona && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-semibold text-marca">Registrar aporte o retiro</summary>
                  <div className="mt-3">
                    <FormularioSimple accion={movimientoFondoAccion.bind(null, id, s.fondo.id)} boton="Guardar">
                      <div className="grid gap-3 sm:grid-cols-4">
                        <Campo etiqueta="Tipo">
                          <Select name="tipo" defaultValue="APORTE">
                            <option value="APORTE">Aporte</option>
                            <option value="RETIRO">Retiro</option>
                          </Select>
                        </Campo>
                        <Campo etiqueta="Fecha">
                          <Input name="fecha" type="date" defaultValue={hoyISO()} required />
                        </Campo>
                        <Campo etiqueta="Monto">
                          <Input name="monto" inputMode="numeric" required />
                        </Campo>
                        <Campo etiqueta="Descripción">
                          <Input name="descripcion" maxLength={200} required />
                        </Campo>
                      </div>
                      <p className="text-xs text-texto-suave">Para pagar un gasto con el fondo, regístralo en Gasto común y elige «Se paga con» este fondo.</p>
                    </FormularioSimple>
                  </div>
                </details>
              )}
            </Card>
          );
        })}
        {gestiona && (
          <Card>
            <h2 className="mb-3 font-bold">Crear otro fondo</h2>
            <FormularioSimple accion={crearFondoAccion.bind(null, id)} boton="Crear fondo">
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo etiqueta="Nombre">
                  <Input name="nombre" maxLength={80} placeholder="Ej: Fondo de pintura" required />
                </Campo>
                <Campo etiqueta="Saldo inicial (opcional)">
                  <Input name="saldoInicial" inputMode="numeric" placeholder="0" />
                </Campo>
              </div>
            </FormularioSimple>
          </Card>
        )}
      </div>
    </>
  );
}
