import Link from "next/link";
import {
  AlertTriangle,
  Banknote,
  ChevronRight,
  ClipboardList,
  FileText,
  Megaphone,
  Pencil,
  Receipt,
  Users,
  Vote,
  type LucideIcon,
} from "lucide-react";
import { db } from "@/lib/db";
import { BotonLink, Indicador, Vacio } from "@/components/ui";
import { resumenPropiedades } from "@/lib/resumen-propiedades";
import { morosidad } from "@/lib/cobro-servicio";
import { nombrePeriodo } from "@/lib/cobro";
import { formatoFechaLarga } from "@/lib/formato";
import { condominioVisible } from "./condominio-actual";
import { ESTADOS, operaFinanzas } from "@/lib/configuracion";

type Tarea = { clave: string; texto: string; detalle: string; accion: string; href: string; icono: LucideIcon };

export default async function PanelPropiedadPage({ params }: PageProps<"/condominios/[id]">) {
  const { id } = await params;
  const { condominio, editable, administradoraId } = await condominioVisible(id);
  const ahora = new Date();
  const [[resumen], publicaciones, abierto, morosas, proximo, votaciones] = await Promise.all([
    resumenPropiedades(administradoraId, [id]),
    db.publicacion.findMany({
      where: { condominioId: id },
      orderBy: { creadoEn: "desc" },
      take: 3,
      select: { id: true, titulo: true, contenido: true, creadoEn: true },
    }),
    db.periodo.findFirst({
      where: { condominioId: id, administradoraId, estado: "ABIERTO" },
      orderBy: [{ anio: "desc" }, { mes: "desc" }],
      include: { _count: { select: { gastos: true } } },
    }),
    morosidad(id, administradoraId),
    db.avisoCobro.findFirst({
      where: { administradoraId, unidad: { condominioId: id }, vencimiento: { gte: ahora } },
      orderBy: { vencimiento: "asc" },
      select: { vencimiento: true },
    }),
    db.votacion.findMany({
      where: { condominioId: id, administradoraId, estado: "ABIERTA", cierraEn: { gt: ahora } },
      orderBy: { cierraEn: "asc" },
      select: { id: true, titulo: true, cierraEn: true, _count: { select: { votos: true } } },
    }),
  ]);
  const base = `/condominios/${id}`;
  const ultimo = resumen.ultimoPeriodo;

  // Lo que conviene hacer hoy, calculado con los datos de la propiedad.
  const tareas: Tarea[] = [];
  if (abierto) {
    tareas.push({
      clave: "abierto",
      texto: `${nombrePeriodo(abierto.anio, abierto.mes)} sigue abierto`,
      detalle: `${abierto._count.gastos} ${abierto._count.gastos === 1 ? "gasto registrado" : "gastos registrados"}. Al cerrarlo se emiten los cobros.`,
      accion: editable ? "Cerrar y emitir" : "Ver gastos",
      href: `${base}/periodos/${abierto.id}`,
      icono: ClipboardList,
    });
  } else if (editable && operaFinanzas(condominio.estado)) {
    tareas.push({
      clave: "abrir",
      texto: "No hay un mes abierto",
      detalle: "Abre el mes para empezar a registrar los gastos.",
      accion: "Abrir mes",
      href: `${base}/periodos`,
      icono: ClipboardList,
    });
  }
  if (ultimo && resumen.avisos > 0 && resumen.notificados < resumen.avisos) {
    tareas.push({
      clave: "avisos",
      texto: `Avisos de ${nombrePeriodo(ultimo.anio, ultimo.mes)} sin enviar`,
      detalle: `Se enviaron ${resumen.notificados} de ${resumen.avisos} por correo.`,
      accion: editable ? "Enviar avisos" : "Ver avisos",
      href: `${base}/periodos/${ultimo.id}`,
      icono: Megaphone,
    });
  }
  for (const v of votaciones) {
    tareas.push({
      clave: v.id,
      texto: `Votación abierta: ${v.titulo}`,
      detalle: `Votaron ${v._count.votos} de ${resumen.unidades} unidades. Cierra el ${formatoFechaLarga(v.cierraEn)}.`,
      accion: "Ver avance",
      href: `${base}/votaciones/${v.id}`,
      icono: Vote,
    });
  }

  const accesos: { texto: string; href: string; icono: LucideIcon; admin?: boolean }[] = [
    { texto: "Registrar pago", href: `${base}/pagos`, icono: Banknote, admin: true },
    { texto: "Gasto común", href: `${base}/periodos`, icono: ClipboardList },
    { texto: "Egresos", href: `${base}/egresos`, icono: Receipt },
    { texto: "Unidades y residentes", href: `${base}/unidades`, icono: Users },
    { texto: "Morosidad", href: `${base}/morosidad`, icono: AlertTriangle },
    { texto: "Rendiciones", href: `${base}/rendiciones`, icono: FileText },
  ];

  return (
    <>
      <nav aria-label="Ruta" className="mb-2 text-sm text-texto-suave">
        <Link href="/" className="hover:text-marca">
          Mis propiedades
        </Link>
        <span aria-hidden="true"> › </span>
        <span>{condominio.nombre}</span>
      </nav>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-convive-oscuro md:text-[2rem]">{condominio.nombre}</h1>
          <p className="mt-1 text-sm text-texto-suave">
            {[condominio.rut && `RUT ${condominio.rut}`, `${resumen.unidades} unidades`, resumen.direccion].filter(Boolean).join(" · ")}
          </p>
        </div>
        {editable && (
          <div className="flex flex-wrap gap-2">
            <BotonLink href={`${base}/configuracion`} variante="secundario">
              <Pencil size={16} aria-hidden="true" /> Configuración
            </BotonLink>
            <BotonLink href={`${base}/muro/nueva`} variante="secundario">
              Nueva publicación
            </BotonLink>
            {operaFinanzas(condominio.estado) && <BotonLink href={`${base}/pagos`}>Registrar pago</BotonLink>}
          </div>
        )}
      </div>

      {!operaFinanzas(condominio.estado) && (
        <section aria-label="Estado de la propiedad" className="mb-8 flex flex-wrap items-center gap-4 rounded-2xl border border-alerta/30 bg-alerta-suave p-4">
          <span className="min-w-0 flex-1 basis-60">
            <span className="block font-bold text-alerta">{ESTADOS[condominio.estado].texto}</span>
            <span className="block text-sm text-texto">{ESTADOS[condominio.estado].descripcion}</span>
          </span>
          {editable && (
            <BotonLink href={`${base}/configuracion`} variante="secundario">
              Continuar configuración
            </BotonLink>
          )}
        </section>
      )}

      <section aria-labelledby="para-hoy" className="mb-8">
        {tareas.length === 0 ? (
          <>
            <h2 id="para-hoy" className="mb-3 text-xl font-bold text-convive-oscuro">
              Para hoy
            </h2>
            <Vacio>No hay nada pendiente. Todo está al día.</Vacio>
          </>
        ) : (
          <div className="sombra-convive overflow-hidden rounded-2xl bg-naranja p-2">
            <h2 id="para-hoy" className="flex items-center gap-2 px-3 pt-2 pb-3 text-xl font-bold text-texto">
              <AlertTriangle size={22} aria-hidden="true" /> Para hoy
            </h2>
          <ul className="space-y-2">
            {tareas.map((t) => (
              <li key={t.clave} className="flex flex-wrap items-center gap-4 rounded-xl bg-white p-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-naranja-suave text-naranja-texto">
                  <t.icono size={20} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 basis-52">
                  <span className="block font-bold text-naranja-texto">{t.texto}</span>
                  <span className="block text-sm text-texto-suave">{t.detalle}</span>
                </span>
                <BotonLink href={t.href} variante="secundario">
                  {t.accion}
                </BotonLink>
              </li>
            ))}
          </ul>
          </div>
        )}
      </section>

      <section aria-label="Indicadores" className="mb-8 grid gap-4 sm:grid-cols-3">
        <Indicador
          etiqueta={ultimo ? `Recaudación de ${nombrePeriodo(ultimo.anio, ultimo.mes)}` : "Recaudación"}
          valor={resumen.recaudacion === null ? "—" : `${Math.round(resumen.recaudacion)} %`}
        >
          {resumen.recaudacion !== null && (
            <div className="h-2 overflow-hidden rounded-full bg-marca-suave" aria-hidden="true">
              <div className="h-full rounded-full bg-marca" style={{ width: `${Math.min(100, resumen.recaudacion)}%` }} />
            </div>
          )}
          {resumen.recaudacion === null && <span className="text-sm text-texto-suave">Aún no hay meses cerrados.</span>}
        </Indicador>
        <Indicador etiqueta="Unidades con deuda vencida" valor={`${morosas.length} de ${resumen.unidades}`} tono={morosas.length > 0 ? "peligro" : undefined}>
          <Link href={`${base}/morosidad`} className="text-sm font-semibold text-marca hover:text-marca-oscuro">
            Ver morosidad
          </Link>
        </Indicador>
        <Indicador etiqueta="Próximo vencimiento" valor={proximo ? formatoFechaLarga(proximo.vencimiento) : "—"}>
          <span className="text-sm text-texto-suave">{proximo ? "Fecha límite del último cobro emitido." : "No hay cobros por vencer."}</span>
        </Indicador>
      </section>

      <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr]">
        <section aria-labelledby="accesos" className="min-w-0">
          <h2 id="accesos" className="mb-3 text-xl font-bold text-convive-oscuro">
            Accesos rápidos
          </h2>
          <div className="sombra-convive grid gap-2 rounded-2xl border border-borde bg-convive-suave/70 p-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {accesos
              .filter((a) => editable || !a.admin)
              .map((a) => (
                <Link
                  key={a.texto}
                  href={a.href}
                  className="group flex min-h-14 items-center gap-3 rounded-xl bg-white px-3 font-semibold text-texto transition hover:text-convive-oscuro hover:shadow-sm"
                >
                  <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-convive-suave text-convive-oscuro">
                    <a.icono size={19} />
                  </span>
                  <span className="min-w-0 flex-1">{a.texto}</span>
                  <ChevronRight size={18} className="shrink-0 text-texto-suave group-hover:text-convive-oscuro" aria-hidden="true" />
                </Link>
              ))}
          </div>
        </section>

        <section aria-labelledby="ultimos-avisos" className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="ultimos-avisos" className="text-xl font-bold text-convive-oscuro">
              Muro de la comunidad
            </h2>
            <Link href={`${base}/muro`} className="text-sm font-semibold text-marca hover:text-marca-oscuro">
              Ver todas las publicaciones
            </Link>
          </div>
          {publicaciones.length === 0 ? (
            <Vacio>
              Aún no hay publicaciones. {editable && "Usa “Nueva publicación” para avisar algo a los residentes."}
            </Vacio>
          ) : (
            <ul className="sombra-convive divide-y divide-borde overflow-hidden rounded-2xl border border-borde bg-white">
              {publicaciones.map((p) => (
                <li key={p.id}>
                  <Link href={`${base}/muro/${p.id}`} className="flex items-center gap-3 p-4 hover:bg-fondo">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-texto-suave">{formatoFechaLarga(p.creadoEn)}</span>
                      <span className="block font-semibold">{p.titulo}</span>
                      <span className="block truncate text-sm text-texto-suave">{p.contenido}</span>
                    </span>
                    <ChevronRight size={20} className="shrink-0 text-texto-suave" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
