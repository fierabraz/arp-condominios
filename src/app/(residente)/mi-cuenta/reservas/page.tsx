import Link from "next/link";
import { requireUsuario } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, Insignia, Mensaje, PageHeader, Vacio } from "@/components/ui";
import { CalendarioReservas } from "@/components/calendario-reservas";
import { AccionConMotivo, FormularioReserva } from "@/components/reservas-formularios";
import { formatoDia, formatoMoneda, hoyChile } from "@/lib/formato";
import { COBROS_RESERVA, diaDeFecha, ESTADOS_RESERVA, fechaDeDia, motivoNoCancelable, sumarDias } from "@/lib/reservas";
import { calendarioEspacio, mensajeReservaHecha } from "@/lib/reservas-servicio";
import { unidadesVisibles } from "../../datos-residente";
import { cancelarMiReserva, reservarEspacio } from "./actions";

export default async function ReservasResidentePage({ searchParams }: PageProps<"/mi-cuenta/reservas">) {
  const usuario = await requireUsuario(["RESIDENTE"]);
  const sp = await searchParams;
  const sel = await unidadesVisibles(usuario, sp.unidad);
  const $ = (n: number | { toString(): string }) => formatoMoneda(n, usuario.administradora?.moneda ?? "CLP");
  const hoy = hoyChile();

  const encabezado = (
    <PageHeader
      titulo="Reservar espacios comunes"
      descripcion="Mira qué días están libres y reserva el quincho, la sala de eventos u otro espacio de tu comunidad."
    />
  );
  // Solo comunidades ya habilitadas (no las que están en configuración) y espacios abiertos.
  const espacios = await db.espacioReservable.findMany({
    where: { condominioId: { in: sel.condominioIds }, activo: true, condominio: { estado: { not: "EN_CONFIGURACION" } } },
    orderBy: [{ condominio: { nombre: "asc" } }, { nombre: "asc" }],
    include: { condominio: { select: { nombre: true } } },
  });
  const misReservas = await db.reserva.findMany({
    where: { unidadId: { in: sel.visibles.map((u) => u.id) }, fecha: { gte: fechaDeDia(sumarDias(hoy, -90)) } },
    orderBy: [{ fecha: "asc" }, { turno: "asc" }],
    include: {
      espacio: { select: { nombre: true } },
      unidad: { select: { numero: true } },
      gasto: { include: { periodo: { select: { anio: true, mes: true, estado: true } } } },
    },
  });
  const vigentes = misReservas.filter((r) => (r.estado === "PENDIENTE" || r.estado === "CONFIRMADA") && diaDeFecha(r.fecha) >= hoy);
  const anteriores = misReservas.filter((r) => !vigentes.includes(r)).reverse().slice(0, 6);
  const hecha = await mensajeReservaHecha(sp.hecha, { unidadIds: sel.todas.map((u) => u.id) }, usuario.administradora?.moneda ?? "CLP", true);
  const varias = new Set(espacios.map((e) => e.condominioId)).size > 1;

  if (espacios.length === 0 && misReservas.length === 0) {
    return (
      <>
        {encabezado}
        <Vacio>Tu comunidad todavía no tiene espacios para reservar en Convive. Si quieres reservar, consulta a tu administración.</Vacio>
      </>
    );
  }

  const espacio = espacios.find((e) => e.id === sp.espacio) ?? espacios[0];
  const cal = espacio ? await calendarioEspacio(espacio, { mes: sp.mes, dia: sp.dia }, hoy, { soloFuturo: true }) : null;
  const enlace = (q: { mes?: string; dia?: string }) =>
    sel.enlace(`/mi-cuenta/reservas?espacio=${espacio!.id}${q.mes ? `&mes=${q.mes}` : ""}${q.dia ? `&dia=${q.dia}` : ""}`);
  const unidadesDelEspacio = espacio ? sel.visibles.filter((u) => u.condominioId === espacio.condominioId) : [];

  return (
    <>
      {encabezado}

      {hecha && (
        <div className="mb-4" role="status">
          <Mensaje texto={hecha} tipo="ok" />
        </div>
      )}

      {vigentes.length > 0 && (
        <section className="mb-6" aria-labelledby="mis-reservas">
          <h2 id="mis-reservas" className="mb-2 text-lg font-bold text-convive-oscuro">
            Mis reservas
          </h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {vigentes.map((r) => {
              const noCancelable = motivoNoCancelable(
                { estado: r.estado, fecha: diaDeFecha(r.fecha), cobro: r.cobro, periodoCargoCerrado: r.gasto?.periodo.estado === "CERRADO" },
                hoy,
                false,
              );
              return (
                <li key={r.id}>
                  <Card className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{r.espacio.nombre}</span>
                      <Insignia tono={ESTADOS_RESERVA[r.estado].tono}>{ESTADOS_RESERVA[r.estado].texto}</Insignia>
                    </div>
                    <p className="text-sm">
                      {formatoDia(r.fecha)} · {r.turno}
                      {sel.visibles.length > 1 && ` · Unidad ${r.unidad.numero}`}
                    </p>
                    {Number(r.monto) > 0 && (
                      <p className="text-sm text-texto-suave">
                        {$(r.monto)} · {r.estado === "PENDIENTE" ? "se cobra si se aprueba" : COBROS_RESERVA[r.cobro].toLowerCase()}
                      </p>
                    )}
                    {noCancelable ? (
                      <p className="text-xs text-texto-suave">{noCancelable}</p>
                    ) : (
                      <AccionConMotivo
                        accion={cancelarMiReserva.bind(null, r.id)}
                        texto="Cancelar reserva"
                        textoConfirmar="Sí, cancelar"
                        ejemplo="Ej.: cambié de fecha"
                        requerido={false}
                        ayuda={Number(r.monto) > 0 && r.cobro === "CARGADO" ? "El turno queda libre y se quita el cobro de tu próximo aviso." : "El turno queda libre para otros vecinos."}
                      />
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {espacio && cal && (
        <>
          {espacios.length > 1 && (
            <nav className="mb-4 flex flex-wrap gap-2" aria-label="Espacio">
              {espacios.map((e) => (
                <Link
                  key={e.id}
                  href={sel.enlace(`/mi-cuenta/reservas?espacio=${e.id}`)}
                  scroll={false}
                  aria-current={e.id === espacio.id ? "page" : undefined}
                  className={`flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold ${
                    e.id === espacio.id ? "border-convive bg-convive text-white" : "border-borde bg-white text-convive-oscuro hover:bg-convive-suave"
                  }`}
                >
                  {e.nombre}
                  {varias && ` · ${e.condominio.nombre}`}
                </Link>
              ))}
            </nav>
          )}

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Card>
              <h2 className="mb-1 text-xl font-bold text-convive-oscuro">{espacio.nombre}</h2>
              <p className="mb-4 text-sm text-texto-suave">
                {[
                  espacio.descripcion,
                  espacio.capacidad ? `Hasta ${espacio.capacidad} personas` : null,
                  Number(espacio.costo) > 0 ? `${$(espacio.costo)} por reserva, se suma a tu aviso de cobro` : "Sin costo",
                  espacio.requiereAprobacion ? "La administración aprueba cada reserva" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <CalendarioReservas
                anio={cal.anio}
                mes={cal.mes}
                semanas={cal.semanas}
                totalTurnos={espacio.turnos.length}
                elegido={cal.elegido?.dia}
                hrefDia={(dia) => `${enlace({ dia })}#reservar`}
                hrefMesAnterior={cal.mesAnterior ? enlace({ mes: cal.mesAnterior }) : undefined}
                hrefMesSiguiente={cal.mesSiguiente ? enlace({ mes: cal.mesSiguiente }) : undefined}
              />
              <p className="mt-3 text-xs text-texto-suave">Puedes reservar hasta el {formatoDia(fechaDeDia(cal.hasta))}.</p>
            </Card>

            <Card>
              <div id="reservar" className="scroll-mt-24">
                {!cal.elegido ? (
                  <p className="text-sm text-texto-suave">Toca un día verde (libre) en el calendario para reservarlo.</p>
                ) : cal.elegido.turnosLibres.length === 0 ? (
                  <p className="text-sm text-texto-suave">Ese día ya no tiene turnos libres. Elige otro día.</p>
                ) : (
                  <div className="space-y-3">
                    <h3 className="text-lg font-bold text-convive-oscuro">
                      Reservar {espacio.nombre} el {formatoDia(fechaDeDia(cal.elegido.dia))}
                    </h3>
                    {espacio.normas && (
                      <div className="rounded-xl border border-borde bg-fondo p-3 text-sm">
                        <p className="mb-1 font-semibold">Normas de uso</p>
                        <p className="whitespace-pre-line text-texto-suave">{espacio.normas}</p>
                      </div>
                    )}
                    <FormularioReserva
                      key={`${espacio.id}-${cal.elegido.dia}`}
                      accion={reservarEspacio}
                      espacioId={espacio.id}
                      dia={cal.elegido.dia}
                      turnosLibres={cal.elegido.turnosLibres}
                      unidades={unidadesDelEspacio.map((u) => ({ id: u.id, nombre: u.nombre }))}
                      normas={espacio.normas}
                      avisoCosto={
                        Number(espacio.costo) > 0
                          ? `Esta reserva cuesta ${$(espacio.costo)}. ${espacio.requiereAprobacion ? "Si se aprueba, se" : "Se"} suma a tu aviso de cobro del mes.`
                          : undefined
                      }
                      textoBoton={espacio.requiereAprobacion ? "Pedir reserva" : "Reservar"}
                      preseleccionar
                      camposOcultos={sel.elegida ? { unidadParam: sel.elegida.id } : {}}
                    />
                  </div>
                )}
              </div>
            </Card>
          </div>
        </>
      )}

      {anteriores.length > 0 && (
        <section className="mt-8" aria-labelledby="anteriores">
          <h2 id="anteriores" className="mb-2 text-lg font-bold text-convive-oscuro">
            Historial de reservas
          </h2>
          <ul className="space-y-2 text-sm">
            {anteriores.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-borde bg-white px-4 py-3">
                <span className="font-semibold">{r.espacio.nombre}</span>
                <span>
                  {formatoDia(r.fecha)} · {r.turno}
                </span>
                <Insignia tono={ESTADOS_RESERVA[r.estado].tono}>{ESTADOS_RESERVA[r.estado].texto}</Insignia>
                {r.motivo && r.estado !== "CONFIRMADA" && <span className="w-full text-xs text-texto-suave">Motivo: {r.motivo}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
