// Panel "Información importante" y "Actividad reciente" del inicio del residente.
// Funciones puras: reciben datos ya filtrados por las unidades del residente
// y no consultan la base de datos, para poder probarlas sin servidor.

export type NivelAlerta = "urgente" | "importante" | "informativo";
export type IconoAlerta = "deuda" | "vencimiento" | "votacion" | "aviso";

export type Alerta = {
  id: string;
  nivel: NivelAlerta;
  icono: IconoAlerta;
  titulo: string;
  detalle: string;
  href: string;
};

export type CuentaUnidad = {
  unidadId: string;
  nombre: string;
  deuda: number;
  vencida: number;
  /** Vencimiento del aviso pendiente más próximo que aún no vence. */
  proximoVencimiento: Date | null;
};

export type VotacionPendiente = { id: string; titulo: string; cierraEn: Date };
export type PublicacionReciente = { id: string; titulo: string; creadoEn: Date };

const DIA = 86_400_000;
/** Un gasto común que vence en estos días ya es "importante". */
export const DIAS_AVISO_VENCIMIENTO = 7;
/** Publicaciones del muro de estos últimos días aparecen como "informativo". */
export const DIAS_PUBLICACION_RECIENTE = 7;

const ORDEN: Record<NivelAlerta, number> = { urgente: 0, importante: 1, informativo: 2 };

export function construirAlertas({
  cuentas,
  votaciones,
  publicaciones,
  ahora,
  moneda,
  fecha,
  enlace = (href) => href,
}: {
  cuentas: CuentaUnidad[];
  votaciones: VotacionPendiente[];
  publicaciones: PublicacionReciente[];
  ahora: Date;
  moneda: (n: number) => string;
  fecha: (d: Date) => string;
  enlace?: (href: string) => string;
}): Alerta[] {
  const alertas: Alerta[] = [];
  const varias = cuentas.length > 1;
  for (const c of cuentas) {
    const sufijo = varias ? ` (${c.nombre})` : "";
    if (c.vencida > 0) {
      alertas.push({
        id: `deuda-${c.unidadId}`,
        nivel: "urgente",
        icono: "deuda",
        titulo: `Deuda vencida${sufijo}`,
        detalle: `Tienes ${moneda(c.vencida)} de gastos comunes vencidos.`,
        href: enlace("/mi-cuenta/pagos"),
      });
    }
    const porVencer = c.deuda - c.vencida;
    if (
      porVencer > 0 &&
      c.proximoVencimiento &&
      c.proximoVencimiento >= ahora &&
      c.proximoVencimiento.getTime() - ahora.getTime() <= DIAS_AVISO_VENCIMIENTO * DIA
    ) {
      alertas.push({
        id: `vence-${c.unidadId}`,
        nivel: "importante",
        icono: "vencimiento",
        titulo: `Gasto común por vencer${sufijo}`,
        detalle: `${moneda(porVencer)} vence el ${fecha(c.proximoVencimiento)}.`,
        href: enlace("/mi-cuenta/pagos"),
      });
    }
  }
  for (const v of votaciones) {
    alertas.push({
      id: `votacion-${v.id}`,
      nivel: "importante",
      icono: "votacion",
      titulo: "Votación pendiente",
      detalle: `${v.titulo}. Vota hasta el ${fecha(v.cierraEn)}.`,
      href: enlace("/mi-cuenta/votaciones"),
    });
  }
  for (const p of publicaciones) {
    if (ahora.getTime() - p.creadoEn.getTime() > DIAS_PUBLICACION_RECIENTE * DIA) continue;
    alertas.push({
      id: `aviso-${p.id}`,
      nivel: "informativo",
      icono: "aviso",
      titulo: "Aviso de la comunidad",
      detalle: p.titulo,
      href: enlace("/mi-cuenta/comunidad"),
    });
  }
  // Orden estable: dentro de cada nivel se conserva el orden de llegada.
  return alertas
    .map((a, i) => ({ a, i }))
    .sort((x, y) => ORDEN[x.a.nivel] - ORDEN[y.a.nivel] || x.i - y.i)
    .map((x) => x.a);
}

export type TipoEvento = "aviso-cobro" | "pago" | "publicacion" | "votacion";
export type Evento = { id: string; tipo: TipoEvento; texto: string; fecha: Date; href: string };

/** Últimos eventos reales del residente, del más nuevo al más antiguo, sin fechas futuras. */
export function actividadReciente(eventos: Evento[], ahora: Date, cuantos = 5): Evento[] {
  return eventos
    .filter((e) => e.fecha <= ahora)
    .sort((a, b) => b.fecha.getTime() - a.fecha.getTime())
    .slice(0, cuantos);
}
