import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import type { UsuarioActual } from "@/lib/auth";
import { estadoCuenta } from "@/lib/cobro-servicio";
import { nombrePeriodo } from "@/lib/cobro";
import { ETIQUETAS_TIPO_UNIDAD, formatoFechaLarga, formatoMoneda } from "@/lib/formato";
import {
  actividadReciente,
  construirAlertas,
  type CuentaUnidad,
  type Evento,
  type VotacionPendiente,
} from "@/lib/alertas-residente";

// Datos del portal del residente. Todo parte de las unidades vinculadas a la persona
// del usuario: nada de lo que se consulta aquí sale de esas unidades o de sus propiedades.

export type UnidadResidente = {
  id: string;
  nombre: string;
  condominioId: string;
  condominioNombre: string;
  propietario: boolean;
};

export const unidadesDelResidente = cache(async (personaId: string | null): Promise<UnidadResidente[]> => {
  if (!personaId) return [];
  const vinculos = await db.unidadPersona.findMany({
    where: { personaId },
    include: { unidad: { include: { condominio: { select: { nombre: true } } } } },
    orderBy: [{ unidad: { condominio: { nombre: "asc" } } }, { unidad: { numero: "asc" } }],
  });
  // Una unidad puede aparecer dos veces (propietario y residente): se muestra una sola vez.
  const porUnidad = new Map<string, UnidadResidente>();
  for (const v of vinculos) {
    const previa = porUnidad.get(v.unidadId);
    porUnidad.set(v.unidadId, {
      id: v.unidadId,
      nombre: `${ETIQUETAS_TIPO_UNIDAD[v.unidad.tipo]} ${v.unidad.numero}`,
      condominioId: v.unidad.condominioId,
      condominioNombre: v.unidad.condominio.nombre,
      propietario: (previa?.propietario ?? false) || v.relacion === "PROPIETARIO",
    });
  }
  return [...porUnidad.values()];
});

/**
 * Unidades que se muestran según el selector (?unidad=...). Un id que no es del
 * residente se ignora: así nadie ve otra unidad cambiando la dirección.
 */
export async function unidadesVisibles(usuario: UsuarioActual, unidadParam?: string | string[]) {
  const todas = await unidadesDelResidente(usuario.personaId);
  const id = Array.isArray(unidadParam) ? unidadParam[0] : unidadParam;
  const elegida = todas.find((u) => u.id === id) ?? null;
  const visibles = elegida ? [elegida] : todas;
  const condominioIds = [...new Set(visibles.map((u) => u.condominioId))];
  return { todas, elegida, visibles, condominioIds, enlace: (href: string) => conUnidad(href, elegida?.id) };
}

/** Agrega ?unidad= a un enlace interno, respetando un #ancla al final. */
export function conUnidad(href: string, unidadId?: string | null) {
  if (!unidadId) return href;
  const [ruta, ancla] = href.split("#");
  const sep = ruta.includes("?") ? "&" : "?";
  return `${ruta}${sep}unidad=${encodeURIComponent(unidadId)}${ancla ? `#${ancla}` : ""}`;
}

type Estado = NonNullable<Awaited<ReturnType<typeof estadoCuenta>>>;

/** Fecha del aviso pendiente más próximo que todavía no vence. */
function proximoVencimiento(estado: Estado, ahora: Date) {
  const fechas = estado.avisos
    .filter((a) => Number(a.saldo) > 0 && a.vencimiento >= ahora)
    .map((a) => a.vencimiento.getTime());
  return fechas.length ? new Date(Math.min(...fechas)) : null;
}

/** Estado de cuenta de cada unidad visible, sin cambiar cómo se calcula. */
export async function cuentasDe(usuario: UsuarioActual, unidades: UnidadResidente[]) {
  const estados = await Promise.all(
    unidades.map(async (u) => ({ unidad: u, estado: await estadoCuenta(u.id, usuario.administradoraId!) })),
  );
  return estados.filter((e): e is { unidad: UnidadResidente; estado: Estado } => e.estado !== null);
}

/** Votaciones abiertas donde alguna unidad visible de la que es propietario aún no vota. */
async function votacionesPendientes(unidades: UnidadResidente[], condominioIds: string[], ahora: Date) {
  const conVoto = unidades.filter((u) => u.propietario);
  if (conVoto.length === 0) return [];
  const abiertas = await db.votacion.findMany({
    where: { condominioId: { in: condominioIds }, estado: "ABIERTA", cierraEn: { gt: ahora } },
    orderBy: { cierraEn: "asc" },
    include: { votos: { where: { unidadId: { in: conVoto.map((u) => u.id) } }, select: { unidadId: true } } },
  });
  return abiertas
    .filter((v) => {
      const votaron = new Set(v.votos.map((x) => x.unidadId));
      return conVoto.some((u) => u.condominioId === v.condominioId && !votaron.has(u.id));
    })
    .map((v): VotacionPendiente => ({ id: v.id, titulo: v.titulo, cierraEn: v.cierraEn }));
}

/** Todo lo que necesita la pantalla de inicio, ya filtrado por las unidades visibles. */
export const datosInicio = cache(async (usuario: UsuarioActual, unidadParam?: string) => {
  const ahora = new Date();
  const moneda = usuario.administradora?.moneda ?? "CLP";
  const $ = (n: number) => formatoMoneda(n, moneda);
  const sel = await unidadesVisibles(usuario, unidadParam);
  const [cuentas, pendientes, publicaciones, votacionesAbiertas, votacionesCerradas] = await Promise.all([
    cuentasDe(usuario, sel.visibles),
    votacionesPendientes(sel.visibles, sel.condominioIds, ahora),
    db.publicacion.findMany({
      where: { condominioId: { in: sel.condominioIds } },
      orderBy: { creadoEn: "desc" },
      take: 5,
      select: { id: true, titulo: true, creadoEn: true },
    }),
    db.votacion.findMany({
      where: { condominioId: { in: sel.condominioIds }, estado: "ABIERTA", cierraEn: { gt: ahora } },
      orderBy: { cierraEn: "asc" },
      select: { id: true, titulo: true, cierraEn: true, publicadaEn: true },
    }),
    db.votacion.findMany({
      where: { condominioId: { in: sel.condominioIds }, estado: { not: "BORRADOR" }, cierraEn: { lte: ahora } },
      orderBy: { cierraEn: "desc" },
      take: 3,
      select: { id: true, titulo: true, cierraEn: true, cerradaEn: true },
    }),
  ]);

  const cuentasUnidad: CuentaUnidad[] = cuentas.map(({ unidad, estado }) => ({
    unidadId: unidad.id,
    nombre: unidad.nombre,
    deuda: estado.deuda,
    vencida: estado.vencida,
    proximoVencimiento: proximoVencimiento(estado, ahora),
  }));
  const alertas = construirAlertas({
    cuentas: cuentasUnidad,
    votaciones: pendientes,
    publicaciones,
    ahora,
    moneda: $,
    fecha: formatoFechaLarga,
    enlace: sel.enlace,
  });

  const varias = sel.visibles.length > 1;
  const eventos: Evento[] = [
    ...cuentas.flatMap(({ unidad, estado }) => [
      ...estado.avisos.slice(0, 3).map((a) => ({
        id: `aviso-${a.id}`,
        tipo: "aviso-cobro" as const,
        texto: `Aviso de cobro de ${nombrePeriodo(a.periodo.anio, a.periodo.mes).toLowerCase()}${varias ? ` · ${unidad.nombre}` : ""}`,
        fecha: a.emitidoEn,
        href: sel.enlace("/mi-cuenta/pagos"),
      })),
      ...estado.pagos.filter((p) => !p.anuladoEn).slice(0, 3).map((p) => ({
        id: `pago-${p.id}`,
        tipo: "pago" as const,
        texto: `Pago registrado por ${$(Number(p.monto))}${varias ? ` · ${unidad.nombre}` : ""}`,
        fecha: p.creadoEn,
        href: sel.enlace("/mi-cuenta/pagos"),
      })),
    ]),
    ...publicaciones.map((p) => ({
      id: `pub-${p.id}`,
      tipo: "publicacion" as const,
      texto: `Nuevo aviso: ${p.titulo}`,
      fecha: p.creadoEn,
      href: sel.enlace("/mi-cuenta/comunidad"),
    })),
    ...votacionesAbiertas
      .filter((v) => v.publicadaEn)
      .map((v) => ({
        id: `vot-${v.id}`,
        tipo: "votacion" as const,
        texto: `Se abrió la votación: ${v.titulo}`,
        fecha: v.publicadaEn!,
        href: sel.enlace("/mi-cuenta/votaciones"),
      })),
    ...votacionesCerradas.map((v) => ({
      id: `votc-${v.id}`,
      tipo: "votacion" as const,
      texto: `Terminó la votación: ${v.titulo}`,
      fecha: v.cerradaEn ?? v.cierraEn,
      href: sel.enlace("/mi-cuenta/votaciones"),
    })),
  ];

  const deuda = cuentas.reduce((s, c) => s + c.estado.deuda, 0);
  const vencida = cuentas.reduce((s, c) => s + c.estado.vencida, 0);
  const aFavor = cuentas.reduce((s, c) => s + c.estado.aFavor, 0);
  const vencimientos = cuentasUnidad.map((c) => c.proximoVencimiento).filter((d): d is Date => d !== null);

  return {
    ...sel,
    moneda,
    alertas,
    actividad: actividadReciente(eventos, ahora),
    resumen: {
      deuda,
      vencida,
      aFavor,
      proximoVencimiento: vencimientos.length ? new Date(Math.min(...vencimientos.map((d) => d.getTime()))) : null,
      proximaVotacion: votacionesAbiertas[0] ?? null,
      votacionPendiente: pendientes.length > 0,
    },
  };
});
