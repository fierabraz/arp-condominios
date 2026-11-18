import Link from "next/link";
import { db } from "@/lib/db";
import { Card, Campo, Input, Insignia, PageHeader, Select, Tabla, Vacio } from "@/components/ui";
import { FormularioSimple } from "@/components/formulario-simple";
import { formatoMoneda } from "@/lib/formato";
import { nombrePeriodo } from "@/lib/cobro";
import { puede } from "@/lib/permisos";
import { condominioVisible } from "../condominio-actual";
import { cambiarTrabajadorAccion, cargarRemuneracionesAccion, crearTrabajadorAccion } from "../../remuneraciones-actions";

// FIN-COMP · Entrega D · Remuneraciones básicas: registro del personal y carga mensual como egresos.

export default async function RemuneracionesPage({ params }: PageProps<"/condominios/[id]/remuneraciones">) {
  const { id } = await params;
  const { condominio, usuario, administradoraId, moneda } = await condominioVisible(id);
  const gestiona = puede(usuario, "propiedad.administrar", id);
  const [trabajadores, abiertos, ultimos] = await Promise.all([
    db.trabajador.findMany({ where: { condominioId: id, administradoraId }, orderBy: [{ activo: "desc" }, { nombre: "asc" }] }),
    db.periodo.findMany({ where: { condominioId: id, administradoraId, estado: "ABIERTO" }, orderBy: [{ anio: "desc" }, { mes: "desc" }], select: { id: true, anio: true, mes: true } }),
    db.gasto.findMany({
      where: { administradoraId, trabajadorId: { not: null }, periodo: { condominioId: id } },
      orderBy: [{ fecha: "desc" }, { creadoEn: "desc" }],
      take: 30,
      select: { id: true, descripcion: true, monto: true, estadoPago: true, proveedor: true, periodo: { select: { anio: true, mes: true } } },
    }),
  ]);
  const $ = (x: number | { toString(): string }) => formatoMoneda(x, moneda);
  const activos = trabajadores.filter((t) => t.activo);
  const mensual = activos.reduce((s, t) => s + Number(t.liquido) + Number(t.imposiciones), 0);
  return (
    <>
      <PageHeader titulo="Remuneraciones" descripcion={`${condominio.nombre} · Personal de la comunidad y sus pagos mensuales.`} />
      <p className="mb-6 rounded-xl bg-alerta-suave px-4 py-3 text-sm text-alerta">
        Convive no calcula liquidaciones de sueldo, imposiciones ni impuestos. Registra los montos que informa el contador y los carga cada mes como
        egresos por pagar del gasto común. Las liquidaciones firmadas se adjuntan como respaldo en cada egreso.
      </p>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <p className="text-sm text-texto-suave">Trabajadores activos</p>
          <p className="mt-1 text-2xl font-semibold">{activos.length}</p>
        </Card>
        <Card>
          <p className="text-sm text-texto-suave">Costo mensual informado</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{$(mensual)}</p>
        </Card>
      </div>

      {gestiona && (
        <Card className="mb-6">
          <h2 className="mb-1 font-bold">Cargar las remuneraciones del mes</h2>
          <p className="mb-3 text-sm text-texto-suave">
            Crea un egreso por el sueldo líquido y otro por las imposiciones de cada trabajador activo, en el mes abierto que elijas. Si ya estaban
            cargadas, no se repiten.
          </p>
          {abiertos.length === 0 ? (
            <Vacio>No hay meses abiertos. Abre el mes en Gasto común.</Vacio>
          ) : (
            <FormularioSimple accion={cargarRemuneracionesAccion.bind(null, id)} boton="Cargar remuneraciones" variante="primario">
              <Campo etiqueta="Mes">
                <Select name="periodoId" defaultValue={abiertos[0].id}>
                  {abiertos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {nombrePeriodo(p.anio, p.mes)}
                    </option>
                  ))}
                </Select>
              </Campo>
            </FormularioSimple>
          )}
        </Card>
      )}

      <Card className="mb-6">
        <h2 className="mb-3 font-bold">Personal</h2>
        {trabajadores.length === 0 ? (
          <Vacio>Aún no hay trabajadores registrados.</Vacio>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Cargo</th>
                <th className="text-right">Líquido</th>
                <th className="text-right">Imposiciones</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {trabajadores.map((t) => (
                <tr key={t.id} className={t.activo ? "" : "text-texto-suave"}>
                  <td className="font-semibold">{t.nombre}</td>
                  <td>{t.cargo}</td>
                  <td className="text-right tabular-nums">{$(t.liquido)}</td>
                  <td className="text-right tabular-nums">{$(t.imposiciones)}</td>
                  <td>
                    {!t.activo && <Insignia>De baja</Insignia>}
                    {gestiona && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-sm font-semibold text-marca">Cambiar</summary>
                        <div className="mt-2 w-72 max-w-full space-y-3">
                          <FormularioSimple accion={cambiarTrabajadorAccion.bind(null, id, t.id)} boton="Guardar montos">
                            <Campo etiqueta="Sueldo líquido">
                              <Input name="liquido" inputMode="numeric" defaultValue={Number(t.liquido)} required />
                            </Campo>
                            <Campo etiqueta="Imposiciones y leyes sociales">
                              <Input name="imposiciones" inputMode="numeric" defaultValue={Number(t.imposiciones)} />
                            </Campo>
                          </FormularioSimple>
                          <FormularioSimple accion={cambiarTrabajadorAccion.bind(null, id, t.id)} boton={t.activo ? "Dar de baja" : "Reactivar"} variante={t.activo ? "peligro" : "secundario"}>
                            <input type="hidden" name="activo" value={t.activo ? "0" : "1"} />
                          </FormularioSimple>
                        </div>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Card>

      {gestiona && (
        <Card className="mb-6">
          <h2 className="mb-3 font-bold">Agregar trabajador</h2>
          <FormularioSimple accion={crearTrabajadorAccion.bind(null, id)} boton="Agregar" variante="primario">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo etiqueta="Nombre">
                <Input name="nombre" required />
              </Campo>
              <Campo etiqueta="Cargo">
                <Input name="cargo" placeholder="Conserje, aseo, mantención…" required />
              </Campo>
              <Campo etiqueta="Sueldo líquido mensual">
                <Input name="liquido" inputMode="numeric" placeholder="650.000" required />
              </Campo>
              <Campo etiqueta="Imposiciones y leyes sociales">
                <Input name="imposiciones" inputMode="numeric" placeholder="180.000" />
              </Campo>
            </div>
          </FormularioSimple>
        </Card>
      )}

      <Card>
        <h2 className="mb-3 font-bold">Últimas remuneraciones cargadas</h2>
        {ultimos.length === 0 ? (
          <Vacio>Todavía no se cargan remuneraciones.</Vacio>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <th>Mes</th>
                <th>Detalle</th>
                <th>Trabajador</th>
                <th className="text-right">Monto</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {ultimos.map((g) => (
                <tr key={g.id}>
                  <td>{nombrePeriodo(g.periodo.anio, g.periodo.mes)}</td>
                  <td>
                    <Link href={`/condominios/${id}/egresos/${g.id}`} className="text-marca hover:underline">
                      {g.descripcion}
                    </Link>
                  </td>
                  <td>{g.proveedor}</td>
                  <td className="text-right tabular-nums">{$(g.monto)}</td>
                  <td>{g.estadoPago === "PAGADO" ? <Insignia tono="exito">Pagado</Insignia> : <Insignia tono="alerta">Por pagar</Insignia>}</td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Card>
    </>
  );
}
