import "server-only";
// PAG-001 · Transferencias informadas por los residentes y su verificación con la cartola.
//
// Reglas que no se rompen:
// - Informar una transferencia NO toca la deuda, los avisos ni los pagos.
// - Solo se confirma con un movimiento de la cartola (FIN-003.1). Un comprobante no basta.
// - Al confirmar se crea UN Pago (el de Recaudación) y el movimiento queda conciliado por ese
//   monto, todo en la misma transacción. Así no hay dos ingresos por la misma plata.
// - Toda decisión queda en el registro de cambios (quién, cuándo, antes y después).

import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import type { UsuarioActual } from "@/lib/auth";
import { registrarEn } from "@/lib/registro";
import { bloquearUnidades } from "@/lib/cobro-servicio";
import { sincronizarConstanciaEn } from "@/lib/constancias-servicio";
import { ErrorConciliacion, registrarIngresoDesdeMovimiento } from "@/lib/conciliacion-servicio";
import { formatoFecha, formatoMoneda } from "@/lib/formato";
import {
  buscarCoincidencias,
  COMPROBANTE_TAMANO_MAXIMO,
  cuentaPublicable,
  tipoComprobante,
} from "@/lib/pagos";

type Autor = Pick<UsuarioActual, "id" | "nombre" | "administradoraId">;

export class ErrorTransferencia extends Error {}

/** Ya hay algo muy parecido informado. No se guardó nada; el residente puede confirmar y seguir. */
export class TransferenciaRepetida extends ErrorTransferencia {
  constructor(readonly motivos: string[]) {
    super("Parece que esta transferencia ya fue informada.");
  }
}

// ---------------------------------------------------------------------------
// Cuenta de la comunidad que ven los residentes

/** La cuenta publicada para pagos de la comunidad, o null si no hay una completa y verificada. */
export async function cuentaParaPagos(condominioId: string, administradoraId: string) {
  const cuentas = await db.cuentaBancaria.findMany({
    where: { condominioId, administradoraId, activa: true, recibePagos: true, verificadaEn: { not: null } },
    orderBy: { verificadaEn: "desc" },
  });
  return cuentas.find(cuentaPublicable) ?? null;
}

// ---------------------------------------------------------------------------
// Residente: informar

export type ComprobanteSubido = { nombre: string; datos: Buffer };

/** Lee y valida el comprobante: tamaño y tipo real (por su contenido, no por el nombre). */
export function revisarComprobante(archivo: File | null, datos: Buffer | null): { ok: true; valor: ComprobanteSubido | null } | { ok: false; mensaje: string } {
  if (!archivo || archivo.size === 0 || !datos) return { ok: true, valor: null };
  if (datos.length > COMPROBANTE_TAMANO_MAXIMO) {
    return { ok: false, mensaje: "El comprobante pesa más de 900 KB. Sube una foto más liviana o el PDF del banco." };
  }
  if (!tipoComprobante(new Uint8Array(datos))) {
    return { ok: false, mensaje: "El comprobante debe ser un PDF o una imagen (JPG, PNG o WEBP)." };
  }
  const nombre = (archivo.name || "comprobante").replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 120);
  return { ok: true, valor: { nombre, datos } };
}

export type DatosInforme = {
  unidadId: string;
  avisoId?: string | null;
  fecha: Date;
  monto: number;
  bancoOrigen?: string;
  operacion?: string;
  pagadoPor?: string;
  observaciones?: string;
};

/**
 * Guarda la transferencia informada. Antes revisa que la unidad sea del residente y que no se
 * haya informado ya lo mismo (mismo comprobante, misma operación, o mismo monto y fecha).
 */
export async function informarTransferencia(
  usuario: UsuarioActual,
  datos: DatosInforme,
  comprobante: ComprobanteSubido | null,
  confirmarRepetida: boolean,
) {
  if (!usuario.personaId || !usuario.administradoraId) throw new ErrorTransferencia("Tu cuenta no está vinculada a una unidad.");
  const administradoraId = usuario.administradoraId;
  const vinculo = await db.unidadPersona.findFirst({
    where: { personaId: usuario.personaId, unidadId: datos.unidadId, unidad: { administradoraId } },
    select: { unidad: { select: { id: true, numero: true, condominioId: true, condominio: { select: { nombre: true } } } } },
  });
  if (!vinculo) throw new ErrorTransferencia("Esa unidad no está vinculada a tu cuenta.");
  const unidad = vinculo.unidad;
  const aviso = datos.avisoId
    ? await db.avisoCobro.findFirst({ where: { id: datos.avisoId, unidadId: unidad.id }, select: { id: true } })
    : null;

  const huella = comprobante ? createHash("sha256").update(comprobante.datos).digest("hex") : null;
  return db.$transaction(async (tx) => {
    // Bloquear la unidad: dos envíos a la vez (doble clic) no pasan los dos el control de repetidos.
    await bloquearUnidades(tx, [unidad.id]);
    if (!confirmarRepetida) {
      const motivos: string[] = [];
      if (huella) {
        const mismo = await tx.comprobanteTransferencia.findFirst({
          where: { condominioId: unidad.condominioId, huella },
          select: { transferencia: { select: { creadoEn: true } } },
        });
        if (mismo) motivos.push(`Ese mismo comprobante ya se subió el ${formatoFecha(mismo.transferencia.creadoEn)}.`);
      }
      const operacion = datos.operacion?.trim();
      if (operacion) {
        const misma = await tx.transferenciaInformada.findFirst({
          where: { condominioId: unidad.condominioId, operacion, estado: { notIn: ["RECHAZADA", "ANULADA"] } },
          select: { id: true },
        });
        if (misma) motivos.push(`Ya se informó una transferencia con el número de operación ${operacion}.`);
      }
      const igual = await tx.transferenciaInformada.findFirst({
        where: { unidadId: unidad.id, fecha: datos.fecha, monto: datos.monto, estado: { notIn: ["RECHAZADA", "ANULADA"] } },
        select: { id: true },
      });
      if (igual) motivos.push("Ya informaste una transferencia por el mismo monto y la misma fecha para esta unidad.");
      if (motivos.length) throw new TransferenciaRepetida(motivos);
    }

    const [avisos, cuenta] = await Promise.all([
      tx.avisoCobro.findMany({ where: { unidadId: unidad.id, saldo: { gt: 0 } }, select: { saldo: true } }),
      cuentaParaPagos(unidad.condominioId, administradoraId),
    ]);
    const deuda = avisos.reduce((s, a) => s + Number(a.saldo), 0);
    const t = await tx.transferenciaInformada.create({
      data: {
        administradoraId,
        condominioId: unidad.condominioId,
        unidadId: unidad.id,
        avisoId: aviso?.id ?? null,
        cuentaId: cuenta?.id ?? null,
        usuarioId: usuario.id,
        informante: usuario.nombre,
        fecha: datos.fecha,
        monto: datos.monto,
        bancoOrigen: datos.bancoOrigen || null,
        operacion: datos.operacion?.trim() || null,
        pagadoPor: datos.pagadoPor || null,
        observaciones: datos.observaciones || null,
        deudaAlInformar: Math.round(deuda * 100) / 100,
      },
    });
    if (comprobante && huella) {
      const tipo = tipoComprobante(new Uint8Array(comprobante.datos))!;
      await tx.comprobanteTransferencia.create({
        data: {
          transferenciaId: t.id,
          condominioId: unidad.condominioId,
          nombre: comprobante.nombre,
          tipo,
          tamano: comprobante.datos.length,
          huella,
          datos: new Uint8Array(comprobante.datos),
        },
      });
    }
    await registrarEn(tx, {
      autor: usuario,
      accion: "Informó una transferencia",
      detalle: `${unidad.condominio.nombre}, unidad ${unidad.numero}: ${formatoMoneda(datos.monto, usuario.administradora?.moneda ?? "CLP")} del ${formatoFecha(datos.fecha)}${comprobante ? " con comprobante" : ""}. Pendiente de verificación.`,
      condominioId: unidad.condominioId,
      entidad: "TransferenciaInformada",
      entidadId: t.id,
      despues: { estado: t.estado, monto: datos.monto, fecha: datos.fecha.toISOString().slice(0, 10) },
    });
    // Constancia con folio, versión 1 «Pendiente de verificación», en la misma transacción.
    await sincronizarConstanciaEn(tx, t.id, usuario.nombre);
    return t;
  });
}

// ---------------------------------------------------------------------------
// Administración: revisar

/** Movimientos de la cartola que podrían ser esta transferencia (todas las cuentas de la comunidad). */
export async function coincidenciasDe(t: { condominioId: string; administradoraId: string; fecha: Date; monto: { toString(): string }; operacion: string | null }) {
  const desde = new Date(t.fecha.getTime() - 10 * 86_400_000);
  const hasta = new Date(t.fecha.getTime() + 10 * 86_400_000);
  const movimientos = await db.movimientoBancario.findMany({
    where: { condominioId: t.condominioId, administradoraId: t.administradoraId, monto: { gt: 0 }, fecha: { gte: desde, lte: hasta } },
    include: { cuenta: { select: { banco: true, numeroFinal: true } } },
    orderBy: { fecha: "asc" },
    take: 500,
  });
  const cuentaDe = new Map(movimientos.map((m) => [m.id, m.cuenta]));
  const r = buscarCoincidencias(
    { fecha: t.fecha, monto: Number(t.monto), operacion: t.operacion },
    movimientos.map((m) => ({
      id: m.id,
      fecha: m.fecha,
      monto: Number(m.monto),
      montoConciliado: Number(m.montoConciliado),
      descripcion: m.descripcion,
      referencia: m.referencia,
      contraparte: m.contraparte,
    })),
  );
  return { ...r, coincidencias: r.coincidencias.map((c) => ({ ...c, cuenta: cuentaDe.get(c.id)! })) };
}

async function bloquearTransferencia(tx: Parameters<Parameters<typeof db.$transaction>[0]>[0], id: string, administradoraId: string) {
  const previa = await tx.transferenciaInformada.findFirst({ where: { id, administradoraId }, select: { unidadId: true } });
  if (!previa) throw new ErrorTransferencia("La transferencia no existe.");
  // Mismo orden que los pagos: primero la unidad, después lo demás. Así dos operaciones no se esperan entre sí.
  await bloquearUnidades(tx, [previa.unidadId]);
  await tx.$queryRaw`SELECT id FROM "TransferenciaInformada" WHERE id = ${id} FOR UPDATE`;
  const t = await tx.transferenciaInformada.findUniqueOrThrow({
    where: { id },
    include: { unidad: { select: { numero: true, condominio: { select: { nombre: true } } } } },
  });
  return t;
}

const etiqueta = (t: { unidad: { numero: string; condominio: { nombre: string } } }) => `${t.unidad.condominio.nombre}, unidad ${t.unidad.numero}`;

/**
 * Confirma la transferencia con un movimiento de la cartola: registra UN pago en Recaudación
 * (con la distribución que eligió la administración o, si no eligió, a lo más antiguo), concilia
 * ese monto del movimiento y deja unidos transferencia, movimiento y pago. Todo o nada.
 * FIN-COMP A: la lógica vive en conciliacion-servicio.ts, la misma que concilia desde la cartola.
 */
export async function confirmarTransferencia(
  autor: Autor,
  datos: { transferenciaId: string; movimientoId: string; monto: number; permitirDuplicado?: boolean; distribucion?: { avisoId: string; monto: number }[] },
) {
  const administradoraId = autor.administradoraId!;
  const t = await db.transferenciaInformada.findFirst({ where: { id: datos.transferenciaId, administradoraId }, select: { condominioId: true, unidadId: true } });
  if (!t) throw new ErrorTransferencia("La transferencia no existe.");
  try {
    return await registrarIngresoDesdeMovimiento(autor, {
      condominioId: t.condominioId,
      movimientoId: datos.movimientoId,
      unidadId: t.unidadId,
      monto: datos.monto,
      transferenciaId: datos.transferenciaId,
      permitirDuplicado: datos.permitirDuplicado,
      distribucion: datos.distribucion,
    });
  } catch (e) {
    if (e instanceof ErrorConciliacion) throw new ErrorTransferencia(e.message);
    throw e;
  }
}

/** Cambia el estado sin registrar pagos: a revisión, rechazada o de vuelta a revisión. */
export async function cambiarEstadoTransferencia(
  autor: Autor,
  datos: { transferenciaId: string; estado: "EN_REVISION" | "RECHAZADA"; nota: string },
) {
  const administradoraId = autor.administradoraId!;
  return db.$transaction(async (tx) => {
    const t = await bloquearTransferencia(tx, datos.transferenciaId, administradoraId);
    if (t.estado === "CONCILIADA") {
      throw new ErrorTransferencia("Ya está conciliada. Para deshacerla, reversa su pago (queda registrado).");
    }
    if (t.estado === "ANULADA") throw new ErrorTransferencia("Su pago ya fue reversado; no se puede cambiar.");
    if (t.pagoId && datos.estado === "RECHAZADA") {
      throw new ErrorTransferencia("Está unida a un pago ya registrado. Si ese pago no corresponde, anúlalo primero en Recaudación.");
    }
    if (t.estado === datos.estado && datos.estado === "RECHAZADA") throw new ErrorTransferencia("Ya estaba rechazada.");
    const actualizada = await tx.transferenciaInformada.update({
      where: { id: t.id },
      data: { estado: datos.estado, nota: datos.nota, revisadoPor: autor.nombre, revisadoEn: new Date() },
    });
    await registrarEn(tx, {
      autor,
      accion: datos.estado === "RECHAZADA" ? "Rechazó una transferencia informada" : "Dejó una transferencia en revisión",
      detalle: `${etiqueta(t)}: ${datos.nota}`,
      condominioId: t.condominioId,
      entidad: "TransferenciaInformada",
      entidadId: t.id,
      antes: { estado: t.estado, nota: t.nota },
      despues: { estado: actualizada.estado, nota: actualizada.nota },
    });
    await sincronizarConstanciaEn(tx, t.id, autor.nombre);
  });
}
