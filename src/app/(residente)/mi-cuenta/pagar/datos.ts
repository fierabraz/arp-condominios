import "server-only";
import { db } from "@/lib/db";
import type { UsuarioActual } from "@/lib/auth";
import { estadoCuenta } from "@/lib/cobro-servicio";
import { unidadesVisibles, type UnidadResidente } from "../../datos-residente";

// PAG-001 · Datos de «Pagar gastos comunes». Todos los montos vienen del estado de cuenta de
// siempre (avisos, pagos y saldos de Recaudación): aquí no se calcula ninguna deuda nueva.

/** La unidad que se consulta: la elegida, o la única que tiene. Con varias y ninguna elegida, null. */
export async function unidadAPagar(usuario: UsuarioActual, unidadParam?: string | string[]) {
  const sel = await unidadesVisibles(usuario, unidadParam);
  const unidad: UnidadResidente | null = sel.elegida ?? (sel.todas.length === 1 ? sel.todas[0] : null);
  return { ...sel, unidad };
}

export async function cuentaDeUnidad(usuario: UsuarioActual, unidad: UnidadResidente) {
  const administradoraId = usuario.administradoraId!;
  const [estado, transferencias, datosUnidad] = await Promise.all([
    estadoCuenta(unidad.id, administradoraId),
    db.transferenciaInformada.findMany({
      where: { unidadId: unidad.id, administradoraId },
      orderBy: { creadoEn: "desc" },
      take: 20,
      include: { comprobante: { select: { id: true, nombre: true } } },
    }),
    db.unidad.findUniqueOrThrow({ where: { id: unidad.id }, select: { numero: true } }),
  ]);
  const enVerificacion = transferencias.filter((t) => t.estado === "INFORMADA" || t.estado === "EN_REVISION");
  return {
    estado: estado!,
    numero: datosUnidad.numero,
    transferencias,
    enVerificacion: {
      cantidad: enVerificacion.length,
      monto: enVerificacion.reduce((s, t) => s + Number(t.monto), 0),
    },
    // Avisos con saldo pendiente, del más antiguo al más nuevo (así se aplican los pagos).
    pendientes: estado!.avisos.filter((a) => Number(a.saldo) > 0).sort((a, b) => a.vencimiento.getTime() - b.vencimiento.getTime()),
  };
}

/** Aviso del QR escaneado, solo si es de esa unidad. */
export async function avisoDeUnidad(unidadId: string, avisoParam?: string | string[]) {
  const id = Array.isArray(avisoParam) ? avisoParam[0] : avisoParam;
  if (!id) return null;
  return db.avisoCobro.findFirst({
    where: { id, unidadId },
    include: { periodo: { select: { anio: true, mes: true } } },
  });
}
