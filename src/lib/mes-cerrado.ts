import "server-only";
// FIN-COMP · Entrega C · Bloqueo de lo que tiene fecha de un mes cerrado (D-FIN-08).

import type { db } from "@/lib/db";
import { nombrePeriodo } from "@/lib/cobro";

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

export class MesCerrado extends Error {}

/**
 * Error si la fecha cae en un mes cerrado de la comunidad. Usar DENTRO de la transacción que guarda:
 * toma el período con FOR SHARE, así un cierre simultáneo espera a que esta operación termine (y
 * esta espera al cierre).
 */
export async function exigirMesAbierto(tx: Tx, condominioId: string, fecha: Date, que: string) {
  const filas = await tx.$queryRaw<{ anio: number; mes: number; cerrado: Date | null }[]>`
    SELECT anio, mes, "mesCerradoEn" AS cerrado FROM "Periodo"
    WHERE "condominioId" = ${condominioId} AND anio = ${fecha.getUTCFullYear()} AND mes = ${fecha.getUTCMonth() + 1}
    FOR SHARE`;
  const p = filas[0];
  if (p?.cerrado) {
    throw new MesCerrado(
      `${nombrePeriodo(p.anio, p.mes)} está cerrado: no se puede ${que} con fecha de ese mes. Si llegó después, regístralo con la fecha real (se aplica igual a la deuda anterior).`,
    );
  }
}
