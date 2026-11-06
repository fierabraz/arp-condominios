import Link from "next/link";
import { db } from "@/lib/db";
import { BotonLink, Card, Insignia, Mensaje, PageHeader, Tabla, Vacio } from "@/components/ui";
import { CalendarioReservas } from "@/components/calendario-reservas";
import { AccionConMotivo, BotonAccion, FormularioReserva } from "@/components/reservas-formularios";
import { formatoDia, formatoFechaHora, formatoMoneda, hoyChile } from "@/lib/formato";
import { COBROS_RESERVA, ESTADOS_RESERVA, fechaDeDia } from "@/lib/reservas";
import { calendarioEspacio, mensajeReservaHecha } from "@/lib/reservas-servicio";
import { operaAdministracion } from "@/lib/configuracion";
import { aprobarReserva, cancelarReservaAdministracion, rechazarReservaConMotivo, reservarPorUnidad } from "../../reservas-actions";
import { condominioVisible } from "../condominio-actual";

export default async function ReservasPage({ params, searchParams }: PageProps<"/condominios/[id]/reservas">) {
  const { id } = await params;
  const sp = await searchParams;
  const { condominio, editable, moneda } = await condominioVisible(id);
  const $ = (n: number | { toString(): string }) => formatoMoneda(n, moneda);
  const hoy = hoyChile();
  const base = `/condominios/${id}/reservas`;

  const espacios = await db.espacioReservable.findMany({ where: { condominioId: id }, orderBy: [{ activo: "desc" }, { nombre: "asc" }] });
  const encabezado = (
    <PageHeader
      titulo="Reservas de espacios comunes"
      descripcion={`${condominio.nombre} · Calendario de cada espacio, reservas por aprobar y próximas reservas.`}
      acciones={
        <BotonLink href={`${base}/espacios`} variante="secundario">
          Espacios y reglas
        </BotonLink>
      }
    />
  );
  if (espacios.length === 0) {
    return (
      <>
        {encabezado}
        <Vacio>
          Todavía no hay espacios para reservar.{" "}
          {editable && (
            <Link href={`${base}/espacios/nuevo`} className="font-semibold text-marca hover:underline">
              Crea el primero
            </Link>
          )}
          {editable && ", por ejemplo el quincho o la sala de eventos."}
        </Vacio>
      </>
    );
  }

  const espacio = espacios.find((e) => e.id === sp.espacio) ?? espacios[0];
  const cal = await calendarioEspacio(espacio, { mes: sp.mes, dia: sp.dia }, hoy, { soloFuturo: false });
  const enlace = (q: { mes?: string; dia?: string }) =>
    `${base}?espacio=${espacio.id}${q.mes ? `&mes=${q.mes}` : ""}${q.dia ? `&dia=${q.dia}` : ""}`;

  const [pendientes, proximas, unidades] = await Promise.all([
    db.reserva.findMany({
      where: { condominioId: id, estado: "PENDIENTE" },
      orderBy: [{ fecha: "asc" }, { creadoEn: "asc" }],
      include: { espacio: { select: { nombre: true } }, unidad: { select: { numero: true } } },
    }),
    db.reserva.findMany({
      where: { condominioId: id, estado: "CONFIRMADA", fecha: { gte: fechaDeDia(hoy) } },
      orderBy: [{ fecha: "asc" }, { turno: "asc" }],
      take: 30,
      include: { espacio: { select: { nombre: true } }, unidad: { select: { numero: true } } },
    }),
    db.unidad.findMany({ where: { condominioId: id }, orderBy: { numero: "asc" }, select: { id: true, numero: true } }),
  ]);
  const opera = operaAdministracion(condominio.estado);
  const hecha = await mensajeReservaHecha(sp.hecha, { condominioId: id }, moneda, false);

  return (
    <>
      {encabezado}
      {!opera && (
        <p className="mb-4 rounded-xl bg-alerta-suave px-4 py-3 text-sm text-alerta">
          Esta propiedad todavía está en configuración: los residentes aún no pueden reservar. Puedes dejar listos los espacios y sus reglas.
        </p>
      )}

      {hecha && (
        <div className="mb-4" role="status">
          <Mensaje texto={hecha} tipo="ok" />
        </div>
      )}

      {pendientes.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-lg font-bold text-convive-oscuro">Por aprobar ({pendientes.length})</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {pendientes.map((r) => (
              <Card key={r.id} className="space-y-2">
                <p className="font-semibold">
                  {r.espacio.nombre} · {formatoDia(r.fecha)}
                </p>
                <p className="text-sm text-texto-suave">
                  {r.turno} · Unidad {r.unidad.numero} · pedida por {r.solicitadaPor} el {formatoFechaHora(r.creadoEn)}
                  {Number(r.monto) > 0 && ` · ${$(r.monto)}`}
                </p>
                {r.observaciones && <p className="text-sm">“{r.observaciones}”</p>}
                {editable && (
                  <div className="flex flex-wrap items-start gap-4">
                    <BotonAccion accion={aprobarReserva.bind(null, r.id)} texto="Aprobar" />
                    <AccionConMotivo
                      accion={rechazarReservaConMotivo.bind(null, r.id)}
                      texto="Rechazar"
                      textoConfirmar="Confirmar rechazo"
                      ejemplo="Ej.: el quincho está en mantención ese día"
                      ayuda="El turno queda libre y el residente ve el motivo en su cuenta."
                    />
                  </div>
                )}
              </Card>
            ))}
          </div>
        </section>
      )}

      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Espacio">
        {espacios.map((e) => (
          <Link
            key={e.id}
            href={`${base}?espacio=${e.id}`}
            scroll={false}
            aria-current={e.id === espacio.id ? "page" : undefined}
            className={`flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold ${
              e.id === espacio.id ? "border-convive bg-convive text-white" : "border-borde bg-white text-convive-oscuro hover:bg-convive-suave"
            }`}
          >
            {e.nombre}
            {!e.activo && " (cerrado)"}
          </Link>
        ))}
      </nav>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CalendarioReservas
            anio={cal.anio}
            mes={cal.mes}
            semanas={cal.semanas}
            totalTurnos={espacio.turnos.length}
            elegido={cal.elegido?.dia}
            hrefDia={(dia) => enlace({ dia })}
            hrefMesAnterior={cal.mesAnterior ? enlace({ mes: cal.mesAnterior }) : undefined}
            hrefMesSiguiente={cal.mesSiguiente ? enlace({ mes: cal.mesSiguiente }) : undefined}
            abrirOcupados
          />
          <p className="mt-3 text-xs text-texto-suave">
            {espacio.turnos.join(" · ")} · {Number(espacio.costo) > 0 ? `${$(espacio.costo)} por reserva` : "sin costo"} · los residentes reservan
            hasta el {formatoDia(fechaDeDia(cal.hasta))}.
          </p>
        </Card>

        <Card>
          {!cal.elegido ? (
            <p className="text-sm text-texto-suave">Toca un día del calendario para ver sus reservas o reservar a nombre de una unidad.</p>
          ) : (
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-convive-oscuro">{formatoDia(fechaDeDia(cal.elegido.dia))}</h3>
              {cal.reservasDia.length === 0 ? (
                <p className="text-sm text-texto-suave">Sin reservas este día.</p>
              ) : (
                <ul className="space-y-3">
                  {cal.reservasDia.map((r) => (
                    <li key={r.id} className="rounded-xl border border-borde p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{r.turno}</span>
                        <Insignia tono={ESTADOS_RESERVA[r.estado].tono}>{ESTADOS_RESERVA[r.estado].texto}</Insignia>
                      </div>
                      <p className="mt-1 text-texto-suave">
                        Unidad {r.unidad.numero} · {r.porAdministracion ? `reservada por la administración (${r.solicitadaPor})` : `pedida por ${r.solicitadaPor}`}
                        {Number(r.monto) > 0 && ` · ${$(r.monto)}, ${COBROS_RESERVA[r.cobro].toLowerCase()}`}
                      </p>
                      {r.observaciones && <p className="mt-1">“{r.observaciones}”</p>}
                      {editable && r.estado === "CONFIRMADA" && (
                        <AccionConMotivo
                          accion={cancelarReservaAdministracion.bind(null, r.id)}
                          texto="Cancelar reserva"
                          textoConfirmar="Confirmar cancelación"
                          ejemplo="Ej.: el residente avisó que no la usará"
                          ayuda="El turno queda libre. Si el cargo está en un mes todavía abierto, se quita."
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {editable && opera && espacio.activo && cal.elegido.turnosLibres.length > 0 && (
                <div className="border-t border-borde pt-4">
                  <h4 className="mb-2 font-semibold">Reservar a nombre de una unidad</h4>
                  <FormularioReserva
                    key={`${espacio.id}-${cal.elegido.dia}`}
                    accion={reservarPorUnidad.bind(null, id)}
                    espacioId={espacio.id}
                    dia={cal.elegido.dia}
                    turnosLibres={cal.elegido.turnosLibres}
                    unidades={unidades.map((u) => ({ id: u.id, nombre: `Unidad ${u.numero}` }))}
                    avisoCosto={Number(espacio.costo) > 0 ? `Se cargarán ${$(espacio.costo)} al aviso de cobro de la unidad.` : undefined}
                    textoBoton="Reservar"
                  />
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      <section className="mt-8">
        <h2 className="mb-2 text-lg font-bold text-convive-oscuro">Próximas reservas confirmadas</h2>
        {proximas.length === 0 ? (
          <Vacio>No hay reservas confirmadas desde hoy.</Vacio>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Espacio</th>
                <th>Turno</th>
                <th>Unidad</th>
                <th>Cobro</th>
              </tr>
            </thead>
            <tbody>
              {proximas.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">
                    <Link href={`${base}?espacio=${r.espacioId}&dia=${r.fecha.toISOString().slice(0, 10)}`} className="text-marca hover:underline">
                      {formatoDia(r.fecha)}
                    </Link>
                  </td>
                  <td>{r.espacio.nombre}</td>
                  <td>{r.turno}</td>
                  <td>{r.unidad.numero}</td>
                  <td className="text-xs">
                    {Number(r.monto) > 0 ? `${$(r.monto)} · ` : ""}
                    {COBROS_RESERVA[r.cobro]}
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
        <p className="mt-2 text-xs text-texto-suave">
          Las reservas con costo agregan un cargo a la unidad en el mes de la reserva (si ese mes ya se emitió, en el siguiente mes abierto). El cargo se ve en Gasto
          común, junto a los demás cargos individuales.
        </p>
      </section>
    </>
  );
}
