import "server-only";
// COM-001 · Entrega 5: junta los datos de una apertura para mostrarla y revisarla.

import { db } from "@/lib/db";
import { resumenApertura, type DatosApertura } from "@/lib/apertura";

export async function datosApertura(aperturaId: string) {
  const a = await db.apertura.findUniqueOrThrow({
    where: { id: aperturaId },
    include: {
      deudas: { include: { unidad: { select: { numero: true } } } },
      creditos: { include: { unidad: { select: { numero: true } } }, orderBy: { creadoEn: "asc" } },
      fondos: { orderBy: { creadoEn: "asc" } },
      cuentas: { orderBy: { creadoEn: "asc" } },
      obligaciones: { include: { proveedor: { select: { nombre: true } } }, orderBy: { creadoEn: "asc" } },
    },
  });
  a.deudas.sort(
    (x, y) => x.unidad.numero.localeCompare(y.unidad.numero, "es", { numeric: true }) || x.periodo.localeCompare(y.periodo) || x.concepto.localeCompare(y.concepto),
  );
  const datos: DatosApertura = {
    fechaCorte: a.fechaCorte,
    deudas: a.deudas,
    creditos: a.creditos,
    fondos: a.fondos,
    cuentas: a.cuentas,
    obligaciones: a.obligaciones,
  };
  return { apertura: a, datos, resumen: resumenApertura(datos) };
}
