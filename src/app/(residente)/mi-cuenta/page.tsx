import { Suspense } from "react";
import Link from "next/link";
import { Activity, AlertTriangle, BarChart3, CalendarDays, ChevronRight, Vote, Wallet } from "lucide-react";
import { requirePermiso } from "@/lib/auth";
import { Vacio } from "@/components/ui";
import { formatoFechaHora, formatoFechaLarga, formatoMoneda } from "@/lib/formato";
import { MARCA } from "@/lib/marca";
import { datosInicio } from "../datos-residente";
import { SelectorUnidad } from "../navegacion-residente";
import { PanelImportante } from "./panel-importante";
import { TarjetaAccesos, type Acceso } from "./tarjeta-accesos";

export default async function InicioResidentePage({ searchParams }: PageProps<"/mi-cuenta">) {
  const usuario = await requirePermiso("portal.residente");
  const { unidad } = await searchParams;
  const datos = await datosInicio(usuario, typeof unidad === "string" ? unidad : undefined);
  const { enlace, resumen, alertas, actividad } = datos;
  const $ = (n: number) => formatoMoneda(n, datos.moneda);
  const urgentes = alertas.filter((a) => a.nivel === "urgente");

  const informarme: Acceso[] = [
    { texto: "Estado de cuenta y avisos de cobro", icono: "cuenta", href: enlace("/mi-cuenta/pagos") },
    { texto: "Rendiciones financieras", icono: "rendiciones", href: enlace("/mi-cuenta/documentos") },
    { texto: "Noticias y comunicados", icono: "noticias", href: enlace("/mi-cuenta/comunidad") },
    { texto: "Documentos de la comunidad", icono: "avisos" },
    { texto: "Información y actividades", icono: "reserva" },
  ];
  const gestion: Acceso[] = [
    {
      texto: "Participar en votaciones",
      icono: "votar",
      href: enlace("/mi-cuenta/votaciones"),
      insignia: resumen.votacionPendiente ? "Tu voto falta" : undefined,
    },
    { texto: "Cambiar mi contraseña", icono: "clave", href: "/mi-cuenta/perfil" },
    { texto: "Pagar en línea", icono: "pagar" },
    { texto: "Solicitar certificados", icono: "certificado" },
    { texto: "Enviar solicitudes", icono: "solicitud" },
    { texto: "Reportar incidencias", icono: "incidencia" },
    { texto: "Reservar espacios comunes", icono: "reserva", href: enlace("/mi-cuenta/reservas") },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-convive-oscuro md:text-4xl">Hola, {usuario.nombre.split(" ")[0]}</h1>
        <p className="mt-1 text-texto-suave">Bienvenido a {MARCA.nombre}, el portal de tu comunidad.</p>
        {/* En pantallas grandes la comunidad y el selector están en la cabecera. */}
        {datos.todas.length > 0 && (
          <div className="mt-2 md:hidden">
            <Suspense>
              <SelectorUnidad
                compacto
                unidades={datos.todas.map((u) => ({ id: u.id, nombre: u.nombre, condominioNombre: u.condominioNombre }))}
              />
            </Suspense>
          </div>
        )}
      </header>

      {datos.todas.length === 0 ? (
        <Vacio>Tu cuenta aún no está vinculada a ninguna unidad. Contacta a tu administración.</Vacio>
      ) : (
        <>
          {/* En el teléfono, lo urgente se ve arriba sin tener que bajar hasta el panel. */}
          {urgentes.length > 0 && (
            <Link
              href="#importante"
              className="flex min-h-12 items-center gap-3 rounded-2xl border-l-4 border-peligro bg-peligro-suave px-4 py-3 font-semibold text-peligro lg:hidden"
            >
              <AlertTriangle size={22} aria-hidden="true" className="shrink-0" />
              <span className="flex-1">{urgentes.length === 1 ? urgentes[0].detalle : `Tienes ${urgentes.length} avisos urgentes.`}</span>
              <ChevronRight size={20} aria-hidden="true" />
            </Link>
          )}

          <div className="grid items-start gap-4 md:grid-cols-2 lg:grid-cols-3">
            <TarjetaAccesos
              titulo="Quiero informarme"
              descripcion="Revisa tu cuenta, las finanzas y las novedades de tu comunidad."
              icono="informarme"
              accesos={informarme}
            />
            <TarjetaAccesos
              titulo="Quiero realizar una gestión"
              descripcion="Haz tus trámites en línea de forma simple."
              icono="gestion"
              accesos={gestion}
            />
            <div className="md:col-span-2 lg:col-span-1">
              <PanelImportante alertas={alertas} />
            </div>
          </div>

          <div className="grid items-start gap-4 md:grid-cols-2">
            <section aria-labelledby="titulo-resumen" className="rounded-3xl border border-borde bg-white p-5">
              <h2 id="titulo-resumen" className="mb-4 flex items-center gap-2 text-lg font-bold">
                <BarChart3 size={22} aria-hidden="true" className="text-convive-oscuro" /> Resumen de mi comunidad
              </h2>
              <ul className="space-y-3">
                <li>
                  <Link
                    href={enlace("/mi-cuenta/pagos")}
                    className={`flex min-h-16 items-center gap-3 rounded-2xl px-4 py-3 ${
                      resumen.vencida > 0 ? "bg-naranja-suave" : "bg-convive-suave/70"
                    }`}
                  >
                    <Wallet size={24} aria-hidden="true" className={resumen.vencida > 0 ? "text-naranja-texto" : "text-convive-oscuro"} />
                    <span className="flex-1">
                      <span className="block text-sm text-texto-suave">Saldo pendiente</span>
                      <span className={`text-2xl font-bold tabular-nums ${resumen.vencida > 0 ? "text-naranja-texto" : ""}`}>
                        {resumen.deuda > 0 ? $(resumen.deuda) : "Estás al día"}
                      </span>
                      {resumen.deuda === 0 && resumen.aFavor > 0 && (
                        <span className="block text-sm text-texto-suave">Tienes {$(resumen.aFavor)} a favor.</span>
                      )}
                    </span>
                    {resumen.vencida > 0 && (
                      <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-naranja-texto">
                        {$(resumen.vencida)} vencido
                      </span>
                    )}
                  </Link>
                </li>
                {resumen.proximoVencimiento && (
                  <li className="flex min-h-16 items-center gap-3 rounded-2xl bg-convive-suave/70 px-4 py-3">
                    <CalendarDays size={24} aria-hidden="true" className="text-convive-oscuro" />
                    <span>
                      <span className="block text-sm text-texto-suave">Próximo vencimiento</span>
                      <span className="text-xl font-bold">{formatoFechaLarga(resumen.proximoVencimiento)}</span>
                      <span className="block text-sm text-texto-suave">Gastos comunes</span>
                    </span>
                  </li>
                )}
                {resumen.proximaVotacion && (
                  <li>
                    <Link href={enlace("/mi-cuenta/votaciones")} className="flex min-h-16 items-center gap-3 rounded-2xl bg-convive-suave/70 px-4 py-3">
                      <Vote size={24} aria-hidden="true" className="text-convive-oscuro" />
                      <span className="flex-1">
                        <span className="block text-sm text-texto-suave">Votación abierta</span>
                        <span className="font-bold">{resumen.proximaVotacion.titulo}</span>
                        <span className="block text-sm text-texto-suave">Vota hasta el {formatoFechaHora(resumen.proximaVotacion.cierraEn)}</span>
                      </span>
                      <ChevronRight size={20} aria-hidden="true" />
                    </Link>
                  </li>
                )}
              </ul>
            </section>

            <section aria-labelledby="titulo-actividad" className="rounded-3xl border border-borde bg-white p-5">
              <h2 id="titulo-actividad" className="mb-4 flex items-center gap-2 text-lg font-bold">
                <Activity size={22} aria-hidden="true" className="text-convive-oscuro" /> Actividad reciente
              </h2>
              {actividad.length === 0 ? (
                <p className="text-texto-suave">Aún no hay movimientos.</p>
              ) : (
                <ol className="relative space-y-1 border-l-2 border-convive-suave pl-5">
                  {actividad.map((e) => (
                    <li key={e.id} className="relative">
                      <span aria-hidden="true" className="absolute top-4 -left-[1.6rem] h-3 w-3 rounded-full bg-convive" />
                      <Link href={e.href} className="block rounded-xl px-2 py-2 hover:bg-fondo">
                        <span className="block font-semibold">{e.texto}</span>
                        <time dateTime={e.fecha.toISOString()} className="text-sm text-texto-suave">
                          {formatoFechaHora(e.fecha)}
                        </time>
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
