import "server-only";
// PILOTO-001 · Emisión del certificado de «unidad al día». Usa los mismos registros que
// Recaudación (avisos y pagos de la unidad) y lo valida dentro de una transacción con la unidad
// bloqueada, para que un pago anulado al mismo tiempo no deje emitir un certificado falso.

import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import type { UsuarioActual } from "@/lib/auth";
import { bloquearUnidades } from "@/lib/cobro-servicio";
import { nombrePeriodo } from "@/lib/cobro";
import { registrarEn } from "@/lib/registro";
import { evaluarAlDia, formatoFolioCertificado, type DatosCertificado } from "@/lib/certificados";

type Autor = Pick<UsuarioActual, "id" | "nombre" | "administradoraId">;

export class NoEstaAlDia extends Error {}

export async function emitirCertificadoAlDia(autor: Autor, unidadId: string) {
  const administradoraId = autor.administradoraId!;
  return db.$transaction(async (tx) => {
    const unidad = await tx.unidad.findFirst({
      where: { id: unidadId, administradoraId },
      select: { id: true, numero: true, condominioId: true, condominio: { select: { nombre: true, direccion: true, comuna: true, administradora: { select: { moneda: true } } } } },
    });
    if (!unidad) throw new NoEstaAlDia("La unidad no existe.");
    await bloquearUnidades(tx, [unidad.id]);
    const ahora = new Date();
    const [avisos, pagos, pendientes] = await Promise.all([
      tx.avisoCobro.findMany({ where: { unidadId }, select: { saldo: true, vencimiento: true, periodo: { select: { anio: true, mes: true } } } }),
      tx.pago.findMany({ where: { unidadId, anuladoEn: null }, select: { monto: true, aplicaciones: { select: { monto: true } } } }),
      tx.transferenciaInformada.count({ where: { unidadId, estado: { in: ["INFORMADA", "EN_REVISION"] } } }),
    ]);
    const ev = evaluarAlDia(
      avisos.map((a) => ({ saldo: Number(a.saldo), vencimiento: a.vencimiento })),
      ahora,
      pendientes,
    );
    if (!ev.alDia) throw new NoEstaAlDia(ev.motivo);
    const aFavor = pagos.reduce((s, p) => s + Number(p.monto) - p.aplicaciones.reduce((t, a) => t + Number(a.monto), 0), 0);
    const ultimo = avisos.map((a) => a.periodo).sort((a, b) => b.anio * 100 + b.mes - (a.anio * 100 + a.mes))[0];
    const codigo = randomBytes(16).toString("base64url");
    // El folio lo da la base (secuencia); se crea primero y el contenido queda fijo al insertar.
    const [{ folio }] = await tx.$queryRaw<{ folio: number }[]>`SELECT nextval(pg_get_serial_sequence('"CertificadoAlDia"', 'folio'))::int AS folio`;
    const datos: DatosCertificado = {
      folio,
      comunidad: unidad.condominio.nombre,
      direccion: [unidad.condominio.direccion, unidad.condominio.comuna].filter(Boolean).join(", "),
      unidad: unidad.numero,
      moneda: unidad.condominio.administradora.moneda,
      emitidoEn: ahora.toISOString(),
      emitidoPor: autor.nombre,
      porVencer: ev.porVencer,
      proximoVencimiento: ev.proximoVencimiento ? ev.proximoVencimiento.toISOString().slice(0, 10) : null,
      ultimoPeriodo: ultimo ? nombrePeriodo(ultimo.anio, ultimo.mes) : null,
      aFavor: Math.round(Math.max(0, aFavor) * 100) / 100,
      pendientesVerificacion: pendientes,
    };
    const c = await tx.certificadoAlDia.create({
      data: {
        folio,
        administradoraId,
        condominioId: unidad.condominioId,
        unidadId,
        codigo,
        datos,
        huella: createHash("sha256").update(JSON.stringify(datos)).digest("hex"),
        emitidoPor: autor.nombre,
        emitidoEn: ahora,
      },
    });
    await registrarEn(tx, {
      autor,
      accion: "Emitió un certificado de unidad al día",
      detalle: `${unidad.condominio.nombre}, unidad ${unidad.numero}: folio ${formatoFolioCertificado(folio)}.`,
      condominioId: unidad.condominioId,
      entidad: "CertificadoAlDia",
      entidadId: c.id,
    });
    return c;
  });
}

/** Consulta pública por el QR: solo si existe, cuándo se emitió, comunidad y unidad. */
export async function consultaPublicaCertificado(codigo: string) {
  if (!/^[\w-]{20,40}$/.test(codigo)) return null;
  const c = await db.certificadoAlDia.findUnique({ where: { codigo }, select: { folio: true, datos: true, emitidoEn: true, huella: true } });
  if (!c) return null;
  const d = c.datos as unknown as DatosCertificado;
  return { folio: c.folio, comunidad: d.comunidad, unidad: d.unidad, emitidoEn: c.emitidoEn, huella: c.huella };
}
