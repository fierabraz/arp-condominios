import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { puedeVerPropiedad, requireAdministradora } from "@/lib/auth";
import { ESTADOS_CONCILIACION } from "@/lib/cartolas";
import { celdaCsv, dondeMovimientos, leerFiltro } from "@/lib/cartolas-consulta";
import { registrar } from "@/lib/registro";

// FIN-003.1 · Descarga de los movimientos filtrados en CSV (separado por punto y coma, para Excel).

export async function GET(request: Request, { params }: RouteContext<"/condominios/[id]/conciliacion/movimientos/csv">) {
  const { id } = await params;
  const { usuario, administradoraId } = await requireAdministradora("propiedad.ver");
  if (!puedeVerPropiedad(usuario, id)) notFound();
  const condominio = await db.condominio.findFirst({ where: { id, administradoraId }, select: { nombre: true } });
  if (!condominio) notFound();
  const filtro = leerFiltro(Object.fromEntries(new URL(request.url).searchParams));
  const movs = await db.movimientoBancario.findMany({
    where: dondeMovimientos(id, administradoraId, filtro),
    orderBy: [{ fecha: "asc" }, { creadoEn: "asc" }],
    take: 20_000,
    include: { cuenta: { select: { banco: true, numeroFinal: true } } },
  });
  const filas = [
    ["Cuenta", "Fecha", "Descripción", "Referencia", "Cargo", "Abono", "Saldo", "Emisor o receptor", "RUT", "Estado", "Nota", "Hoja", "Fila"].map(celdaCsv).join(";"),
    ...movs.map((m) => {
      const monto = Number(m.monto);
      return [
        celdaCsv(`${m.cuenta.banco} ···${m.cuenta.numeroFinal}`),
        celdaCsv(m.fecha.toISOString().slice(0, 10).split("-").reverse().join("-")),
        celdaCsv(m.descripcion),
        celdaCsv(m.referencia),
        monto < 0 ? celdaCsv(-monto) : "",
        monto > 0 ? celdaCsv(monto) : "",
        m.saldo === null ? "" : celdaCsv(Number(m.saldo)),
        celdaCsv(m.contraparte),
        celdaCsv(m.rutContraparte),
        celdaCsv(ESTADOS_CONCILIACION[m.estado].texto),
        celdaCsv(m.nota),
        celdaCsv(m.hoja),
        m.fila ?? "",
      ].join(";");
    }),
  ];
  await registrar(usuario, "Descargó movimientos bancarios en CSV", `${condominio.nombre}: ${movs.length} movimientos`, id);
  return new Response(`﻿${filas.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="movimientos-bancarios.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
