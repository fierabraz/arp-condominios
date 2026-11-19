import "server-only";
// VER-001 · Verificación automática de transferencias informadas con la cartola, contra la base.
//
// Se apoya en lo que ya existe, sin duplicarlo:
// - Para verificar usa registrarIngresoDesdeMovimiento (FIN-COMP A): crea UN pago aplicado a la
//   deuda más antigua, concilia el abono y marca la transferencia, todo o nada, con la unidad y el
//   movimiento bloqueados. Un abono nunca financia más que su monto (montoConciliado + CHECK).
// - Si el mes del abono está cerrado, si la unidad ya tiene un pago igual o si algo cambió entre
//   medio, NO se fuerza: la transferencia queda «En revisión» con el abono sugerido y el motivo.
// - Los movimientos que la carga marcó como posibles duplicados (estado «Requiere revisión»)
//   no se usan: solo abonos «Pendientes de identificar».
// - Nunca se rechaza una transferencia sola. Todo queda en el registro de cambios.

import { db } from "@/lib/db";
import type { UsuarioActual } from "@/lib/auth";
import { registrarEn } from "@/lib/registro";
import { bloquearUnidades, ErrorCobro, PagoDuplicado } from "@/lib/cobro-servicio";
import { aMinimo, decimalesMoneda, deMinimo } from "@/lib/cobro";
import { formatoFecha, formatoMoneda } from "@/lib/formato";
import { ErrorConciliacion, registrarIngresoDesdeMovimiento } from "@/lib/conciliacion-servicio";
import { sincronizarConstanciaEn } from "@/lib/constancias-servicio";
import {
  decidirVerificacion,
  DIAS_CON_OPERACION,
  textoMotivos,
  type Decision,
  type ResultadoAuto,
  type ResumenVerificacion,
} from "@/lib/verificacion-automatica";

type Autor = Pick<UsuarioActual, "id" | "nombre" | "administradoraId">;

/** Nombre con el que la validación automática firma sus cambios (quién cargó la cartola). */
export const firmaAutomatica = (nombre: string) => `Validación automática (cartola cargada por ${nombre})`.slice(0, 120);

export class ErrorVerificacion extends Error {}

/** Activa o desactiva la verificación automática de una comunidad (queda en el registro). */
export async function cambiarVerificacionAutomatica(autor: Autor, condominioId: string, activa: boolean) {
  const administradoraId = autor.administradoraId!;
  return db.$transaction(async (tx) => {
    const c = await tx.condominio.findFirst({ where: { id: condominioId, administradoraId }, select: { nombre: true, verificacionAutomatica: true } });
    if (!c) throw new ErrorVerificacion("Comunidad no encontrada.");
    if (c.verificacionAutomatica === activa) return;
    await tx.condominio.update({ where: { id: condominioId }, data: { verificacionAutomatica: activa } });
    await registrarEn(tx, {
      autor,
      accion: activa ? "Activó la verificación automática de transferencias" : "Desactivó la verificación automática de transferencias",
      detalle: `${c.nombre}: ${activa ? "al cargar una cartola, las transferencias que coinciden en monto, fecha y n° de operación se verifican solas." : "las transferencias informadas se verifican solo a mano."}`,
      condominioId,
      entidad: "Condominio",
      entidadId: condominioId,
      antes: { verificacionAutomatica: c.verificacionAutomatica },
      despues: { verificacionAutomatica: activa },
    });
  });
}

/** Deja la transferencia «En revisión» con el abono sugerido (sin tocar pagos ni deuda). */
async function dejarEnRevision(autor: Autor, condominioId: string, d: Decision & { resultado: Exclude<ResultadoAuto, "VERIFICADA"> }, moneda: string) {
  const administradoraId = autor.administradoraId!;
  return db.$transaction(async (tx) => {
    const previa = await tx.transferenciaInformada.findFirst({ where: { id: d.transferenciaId, condominioId, administradoraId }, select: { unidadId: true } });
    if (!previa) return false;
    await bloquearUnidades(tx, [previa.unidadId]);
    await tx.$queryRaw`SELECT id FROM "TransferenciaInformada" WHERE id = ${d.transferenciaId} FOR UPDATE`;
    const t = await tx.transferenciaInformada.findUniqueOrThrow({ where: { id: d.transferenciaId }, include: { unidad: { select: { numero: true } } } });
    // Solo si sigue abierta, sin pago y sin decisión manual de por medio.
    if (t.pagoId || !(t.estado === "INFORMADA" || (t.estado === "EN_REVISION" && t.autoResultado))) return false;
    const motivos = textoMotivos(d.motivos);
    // Misma sugerencia que la vez anterior: no se repite en el historial.
    if (t.estado === "EN_REVISION" && t.autoResultado === d.resultado && t.autoMovimientoId === d.movimientoId && t.autoMotivos === motivos) return false;
    const m = await tx.movimientoBancario.findUniqueOrThrow({ where: { id: d.movimientoId }, select: { fecha: true, monto: true } });
    const nota =
      d.resultado === "POR_CONFIRMAR"
        ? `La cartola tiene un abono parecido (${formatoFecha(m.fecha)}, ${formatoMoneda(m.monto, moneda)}). Falta que la administración lo confirme.`
        : `La cartola tiene un abono que podría ser este pago (${formatoFecha(m.fecha)}, ${formatoMoneda(m.monto, moneda)}), pero el monto no calza con lo informado. Se revisa a mano.`;
    await tx.transferenciaInformada.update({
      where: { id: t.id },
      data: {
        estado: "EN_REVISION",
        nota,
        revisadoPor: autor.nombre,
        revisadoEn: new Date(),
        autoResultado: d.resultado,
        autoMovimientoId: d.movimientoId,
        autoMotivos: motivos,
        autoEn: new Date(),
      },
    });
    if (t.estado !== "EN_REVISION") await sincronizarConstanciaEn(tx, t.id, autor.nombre);
    await registrarEn(tx, {
      autor,
      accion: `Validación automática: ${d.resultado === "POR_CONFIRMAR" ? "dejó una transferencia por confirmar" : "marcó una transferencia con diferencias"}`,
      detalle: `Unidad ${t.unidad.numero}: ${formatoMoneda(t.monto, moneda)} del ${formatoFecha(t.fecha)}. ${motivos}.`,
      condominioId,
      entidad: "TransferenciaInformada",
      entidadId: t.id,
      antes: { estado: t.estado, autoResultado: t.autoResultado },
      despues: { estado: "EN_REVISION", autoResultado: d.resultado, movimientoId: d.movimientoId },
    });
    return true;
  });
}

/**
 * Compara las transferencias informadas pendientes de la comunidad con los abonos libres de las
 * cartolas y aplica el resultado. `importacionId` = la cartola recién cargada (sus abonos sin
 * transferencia se muestran en el resumen). Revisa que la comunidad tenga la función activa.
 */
export async function verificarConCartola(usuario: Autor, condominioId: string, importacionId?: string): Promise<ResumenVerificacion> {
  const administradoraId = usuario.administradoraId!;
  const condominio = await db.condominio.findFirst({ where: { id: condominioId, administradoraId }, select: { verificacionAutomatica: true } });
  if (!condominio?.verificacionAutomatica) return { activa: false };
  const adm = await db.administradora.findUniqueOrThrow({ where: { id: administradoraId }, select: { moneda: true } });
  const moneda = adm.moneda;
  const dec = decimalesMoneda(moneda);
  const min = (v: { toString(): string }) => aMinimo(v.toString(), dec);
  const autor: Autor = { id: usuario.id, nombre: firmaAutomatica(usuario.nombre), administradoraId };

  // Pendientes: las informadas y las que la propia validación dejó en revisión (no las que una
  // persona dejó en revisión: esa decisión manual no se pisa).
  const transferencias = await db.transferenciaInformada.findMany({
    where: {
      condominioId,
      administradoraId,
      pagoId: null,
      OR: [{ estado: "INFORMADA" }, { estado: "EN_REVISION", autoResultado: { not: null } }],
    },
    include: { unidad: { select: { numero: true } } },
    orderBy: { creadoEn: "asc" },
    take: 2000,
  });
  const fechas = transferencias.map((t) => t.fecha.getTime());
  const abonos = transferencias.length
    ? await db.movimientoBancario.findMany({
        where: {
          condominioId,
          administradoraId,
          monto: { gt: 0 },
          estado: "PENDIENTE",
          fecha: { gte: new Date(Math.min(...fechas) - DIAS_CON_OPERACION * 86_400_000), lte: new Date(Math.max(...fechas) + DIAS_CON_OPERACION * 86_400_000) },
        },
        take: 5000,
      })
    : [];
  const { decisiones } = decidirVerificacion(
    transferencias.map((t) => ({ id: t.id, unidadId: t.unidadId, unidad: t.unidad.numero, fecha: t.fecha, monto: min(t.monto), operacion: t.operacion })),
    abonos.map((a) => ({ id: a.id, fecha: a.fecha, restante: min(a.monto) - min(a.montoConciliado), descripcion: a.descripcion, referencia: a.referencia, contraparte: a.contraparte })),
  );

  const porId = new Map(transferencias.map((t) => [t.id, t]));
  const cuenta = { verificadas: 0, porConfirmar: 0, conDiferencias: 0 };
  const detalle: { transferenciaId: string; unidad: string; monto: number; fecha: string; resultado: ResultadoAuto; movimientoId: string; motivos: string; cambio: boolean }[] = [];
  for (const d of decisiones) {
    const t = porId.get(d.transferenciaId)!;
    let final: Decision = d;
    let cambio = false;
    if (d.resultado === "VERIFICADA") {
      try {
        await registrarIngresoDesdeMovimiento(autor, {
          condominioId,
          movimientoId: d.movimientoId,
          unidadId: t.unidadId,
          monto: Number(t.monto),
          transferenciaId: t.id,
          automatica: { motivos: textoMotivos(d.motivos) },
        });
        cambio = true;
      } catch (e) {
        // No se fuerza nada: queda por confirmar, con el motivo a la vista.
        const motivo =
          e instanceof PagoDuplicado
            ? "la unidad ya tiene un pago por el mismo monto y fecha (¿se registró a mano?)"
            : e instanceof ErrorConciliacion || e instanceof ErrorCobro
              ? `no se pudo registrar sola: ${e.message.replace(/\.$/, "")}`
              : null;
        if (!motivo) throw e;
        final = { ...d, resultado: "POR_CONFIRMAR", motivos: [...d.motivos, motivo] };
      }
    }
    if (final.resultado !== "VERIFICADA") {
      cambio = await dejarEnRevision(autor, condominioId, final as Decision & { resultado: Exclude<ResultadoAuto, "VERIFICADA"> }, moneda);
    }
    if (final.resultado === "VERIFICADA") cuenta.verificadas++;
    else if (final.resultado === "POR_CONFIRMAR") cuenta.porConfirmar++;
    else cuenta.conDiferencias++;
    detalle.push({
      transferenciaId: t.id,
      unidad: t.unidad.numero,
      monto: Number(t.monto),
      fecha: t.fecha.toISOString().slice(0, 10),
      resultado: final.resultado,
      movimientoId: final.movimientoId,
      motivos: textoMotivos(final.motivos),
      cambio,
    });
  }

  // Abonos de esta cartola que siguen libres y no se sugirieron a ninguna transferencia.
  const sugeridos = new Set(detalle.map((x) => x.movimientoId));
  const libres = importacionId
    ? (
        await db.movimientoBancario.findMany({
          where: { importacionId, condominioId, administradoraId, monto: { gt: 0 }, estado: { not: "CONCILIADO" } },
          orderBy: [{ fecha: "asc" }, { fila: "asc" }],
          take: 1000,
        })
      ).filter((a) => !sugeridos.has(a.id))
    : [];

  const verificacion = await db.$transaction(async (tx) => {
    const v = await tx.verificacionCartola.create({
      data: {
        administradoraId,
        condominioId,
        importacionId: importacionId ?? null,
        usuarioNombre: usuario.nombre,
        revisadas: transferencias.length,
        ...cuenta,
        sinTransferencia: libres.length,
        detalle,
      },
    });
    await registrarEn(tx, {
      autor,
      accion: "Validación automática con la cartola",
      detalle: `${transferencias.length} transferencias pendientes revisadas: ${cuenta.verificadas} verificadas solas, ${cuenta.porConfirmar} por confirmar, ${cuenta.conDiferencias} con diferencias.${importacionId ? ` ${libres.length} abonos de la cartola sin transferencia informada.` : ""}`,
      condominioId,
      entidad: "VerificacionCartola",
      entidadId: v.id,
      despues: { ...cuenta, revisadas: transferencias.length, sinTransferencia: libres.length, importacionId: importacionId ?? null },
    });
    return v;
  });

  return {
    activa: true,
    verificacionId: verificacion.id,
    revisadas: transferencias.length,
    ...cuenta,
    totalSinTransferencia: libres.length,
    sinTransferencia: libres.slice(0, 15).map((a) => ({
      id: a.id,
      fecha: a.fecha.toISOString().slice(0, 10),
      monto: deMinimo(min(a.monto) - min(a.montoConciliado), dec),
      glosa: [a.descripcion, a.referencia, a.contraparte].filter(Boolean).join(" · ").slice(0, 120),
    })),
  };
}
