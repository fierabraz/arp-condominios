import Link from "next/link";
import { CreditCard, Download, Home, UserRound, Users } from "lucide-react";
import { requireUsuario } from "@/lib/auth";
import { db } from "@/lib/db";
import { Insignia, Vacio } from "@/components/ui";
import { ETIQUETAS_TIPO_UNIDAD, formatoFechaLarga, formatoMoneda, formatoPorcentaje } from "@/lib/formato";
import { estadoCuenta } from "@/lib/cobro-servicio";
import { nombrePeriodo } from "@/lib/cobro";
import { EstadoCuenta } from "@/components/estado-cuenta";
import { TarjetaPublicacion } from "@/components/publicacion";
import { VotacionesResidente } from "./votaciones-residente";

type Estado = NonNullable<Awaited<ReturnType<typeof estadoCuenta>>>;

/** Fecha en que vence lo que se debe: el aviso pendiente más antiguo. */
function proximoVencimiento(estado: Estado) {
  const pendientes = estado.avisos.filter((a) => Number(a.saldo) > 0).map((a) => a.vencimiento);
  return pendientes.length ? new Date(Math.min(...pendientes.map((d) => d.getTime()))) : null;
}

export default async function MiCuentaPage() {
  const usuario = await requireUsuario(["RESIDENTE"]);
  const moneda = usuario.administradora?.moneda ?? "CLP";
  const vinculos = usuario.personaId
    ? await db.unidadPersona.findMany({
        where: { personaId: usuario.personaId },
        include: { unidad: { include: { condominio: { select: { nombre: true, direccion: true } } } } },
      })
    : [];
  // Una unidad puede aparecer dos veces (propietario y residente): mostrar su cuenta una sola vez.
  const unidadesUnicas = [...new Map(vinculos.map((v) => [v.unidadId, v])).values()];
  const condominioIds = [...new Set(unidadesUnicas.map((v) => v.unidad.condominioId))];
  const rendiciones = await db.periodo.findMany({
    where: { condominioId: { in: condominioIds }, estado: "CERRADO" },
    orderBy: [{ anio: "desc" }, { mes: "desc" }],
    take: 12,
    include: { condominio: { select: { nombre: true } } },
  });
  const publicaciones = await db.publicacion.findMany({
    where: { condominioId: { in: condominioIds } },
    orderBy: { creadoEn: "desc" },
    take: 5,
    include: { condominio: { select: { id: true, nombre: true } } },
  });
  const estados = (
    await Promise.all(unidadesUnicas.map(async (v) => ({ v, estado: await estadoCuenta(v.unidadId, usuario.administradoraId!) })))
  ).filter((e): e is { v: (typeof unidadesUnicas)[number]; estado: Estado } => e.estado !== null);
  // Primero las unidades que deben más.
  const porDeuda = [...estados].sort((a, b) => b.estado.deuda - a.estado.deuda);
  const [principal, ...otras] = porDeuda;
  const nombrePropiedad = condominioIds.length === 1 ? unidadesUnicas[0].unidad.condominio.nombre : null;
  const $ = (n: number) => formatoMoneda(n, moneda);
  const nombreUnidad = (v: (typeof unidadesUnicas)[number]) => `${ETIQUETAS_TIPO_UNIDAD[v.unidad.tipo]} ${v.unidad.numero}`;

  return (
    <div className="pb-24 md:pb-0">
      <header className="mb-6">
        {nombrePropiedad && <p className="text-sm text-texto-suave">{nombrePropiedad}</p>}
        <h1 className="text-2xl font-bold tracking-tight md:text-[1.75rem]">Hola, {usuario.nombre.split(" ")[0]}</h1>
      </header>

      {vinculos.length === 0 ? (
        <Vacio>Tu cuenta aún no está vinculada a ninguna unidad. Contacta a tu administración.</Vacio>
      ) : (
        <div className="mb-8 grid gap-3 lg:grid-cols-2">
          {principal && (
            <section
              aria-label={`Cuenta de ${nombreUnidad(principal.v)}`}
              className={`flex flex-col gap-1.5 rounded-3xl p-6 lg:row-span-2 ${
                principal.estado.deuda > 0 ? "bg-marca text-white" : "border border-borde bg-white"
              }`}
            >
              <span className={principal.estado.deuda > 0 ? "text-white/90" : "text-texto-suave"}>
                {nombreUnidad(principal.v)}
                {!nombrePropiedad && ` · ${principal.v.unidad.condominio.nombre}`}
              </span>
              {principal.estado.deuda > 0 ? (
                <>
                  <span className="text-4xl font-bold tracking-tight tabular-nums">{$(principal.estado.deuda)}</span>
                  <span>
                    {principal.estado.vencida > 0
                      ? `Tienes ${$(principal.estado.vencida)} vencido`
                      : `Vence el ${formatoFechaLarga(proximoVencimiento(principal.estado)!)}`}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-3xl font-bold">Estás al día</span>
                  <span className="text-texto-suave">
                    {principal.estado.aFavor > 0 ? `Tienes ${$(principal.estado.aFavor)} a favor.` : "No tienes cobros pendientes."}
                  </span>
                </>
              )}
              <a
                href={`#unidad-${principal.v.unidadId}`}
                className={`mt-3 inline-flex min-h-12 items-center justify-center rounded-2xl px-4 font-semibold ${
                  principal.estado.deuda > 0
                    ? "border-[1.5px] border-white/70 text-white hover:bg-white/10"
                    : "bg-marca-suave text-marca hover:bg-marca hover:text-white"
                }`}
              >
                Ver detalle
              </a>
            </section>
          )}
          {otras.map(({ v, estado }) => (
            <a
              key={v.unidadId}
              href={`#unidad-${v.unidadId}`}
              className="flex min-h-16 items-center justify-between gap-3 rounded-2xl border border-borde bg-white px-5 py-3 hover:border-marca"
            >
              <span className="flex flex-col">
                <span className="font-semibold">{nombreUnidad(v)}</span>
                <span className="text-sm text-texto-suave">
                  {estado.deuda === 0
                    ? "Al día"
                    : estado.vencida > 0
                      ? "Tiene deuda vencida"
                      : `Vence el ${formatoFechaLarga(proximoVencimiento(estado)!)}`}
                </span>
              </span>
              <span className={`text-lg font-bold tabular-nums ${estado.vencida > 0 ? "text-peligro" : ""}`}>{$(estado.deuda)}</span>
            </a>
          ))}
        </div>
      )}

      {usuario.personaId && <VotacionesResidente personaId={usuario.personaId} condominioIds={condominioIds} />}

      {publicaciones.length > 0 && (
        <section id="muro" aria-labelledby="titulo-muro" className="mb-10 scroll-mt-24">
          <h2 id="titulo-muro" className="mb-3 text-xl font-bold">
            Avisos de la comunidad
          </h2>
          <div className="space-y-3">
            {publicaciones.map((p) => (
              <TarjetaPublicacion key={p.id} p={p} editable={false} completa />
            ))}
          </div>
        </section>
      )}

      {rendiciones.length > 0 && (
        <section aria-labelledby="titulo-documentos" className="mb-10">
          <h2 id="titulo-documentos" className="mb-1 text-xl font-bold">
            Documentos
          </h2>
          <p className="mb-3 text-sm text-texto-suave">Rendiciones: en qué se gastó el dinero de la comunidad cada mes.</p>
          <ul className="divide-y divide-borde overflow-hidden rounded-2xl border border-borde bg-white">
            {rendiciones.map((r) => (
              <li key={r.id}>
                <a
                  href={`/rendiciones/${r.id}/pdf`}
                  target="_blank"
                  rel="noopener"
                  className="flex min-h-14 items-center justify-between gap-3 px-5 py-3 hover:bg-fondo"
                >
                  <span>
                    <span className="font-semibold">Rendición de {nombrePeriodo(r.anio, r.mes).toLowerCase()}</span>
                    {condominioIds.length > 1 && <span className="block text-sm text-texto-suave">{r.condominio.nombre}</span>}
                  </span>
                  <Download size={20} className="shrink-0 text-marca" aria-label="Descargar PDF" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {estados.length > 0 && (
        <section id="pagos" aria-labelledby="titulo-pagos" className="scroll-mt-24">
          <h2 id="titulo-pagos" className="mb-4 text-xl font-bold">
            Mis cobros y pagos
          </h2>
          <div className="space-y-10">
            {estados.map(({ v, estado }) => (
              <section key={v.unidadId} id={`unidad-${v.unidadId}`} className="scroll-mt-24">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-bold">{nombreUnidad(v)}</h3>
                  {estado.vencida > 0 ? (
                    <Insignia tono="peligro">Deuda vencida</Insignia>
                  ) : estado.deuda > 0 ? (
                    <Insignia tono="alerta">Por pagar</Insignia>
                  ) : (
                    <Insignia tono="exito">Al día</Insignia>
                  )}
                </div>
                <p className="mb-4 text-sm text-texto-suave">
                  {v.unidad.condominio.nombre} · Alícuota {formatoPorcentaje(v.unidad.alicuota)}
                </p>
                <EstadoCuenta estado={estado} moneda={moneda} />
              </section>
            ))}
          </div>
        </section>
      )}

      <nav
        aria-label="Navegación del residente"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-borde bg-white px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden"
      >
        {[
          { texto: "Inicio", href: "#", icono: Home, activo: true },
          { texto: "Mis pagos", href: "#pagos", icono: CreditCard },
          { texto: "Comunidad", href: "#muro", icono: Users },
          { texto: "Mi perfil", href: "/contrasena", icono: UserRound },
        ].map((e) => {
          const clase = `flex min-h-12 flex-col items-center justify-center gap-1 text-xs ${
            e.activo ? "font-bold text-marca" : "font-medium text-texto-suave"
          }`;
          const contenido = (
            <>
              <e.icono size={22} aria-hidden="true" />
              {e.texto}
            </>
          );
          return e.href.startsWith("/") ? (
            <Link key={e.texto} href={e.href} className={clase}>
              {contenido}
            </Link>
          ) : (
            <a key={e.texto} href={e.href} className={clase} aria-current={e.activo ? "page" : undefined}>
              {contenido}
            </a>
          );
        })}
      </nav>
    </div>
  );
}
