import Link from "next/link";
import { db } from "@/lib/db";
import { Card, Insignia, PageHeader, Tabla, Vacio } from "@/components/ui";
import { formatoFecha, formatoMoneda } from "@/lib/formato";
import { nombrePeriodo } from "@/lib/cobro";
import { condominioVisible } from "../condominio-actual";

// FIN-COMP · Entrega B · Egresos de la comunidad: los gastos comunes y su pago al proveedor, con
// respaldo y conciliación con la cartola. Los cargos individuales a unidades no son egresos.

export default async function EgresosPage({ params, searchParams }: PageProps<"/condominios/[id]/egresos">) {
  const { id } = await params;
  const sp = await searchParams;
  const filtro = typeof sp.estado === "string" ? sp.estado : "";
  const { condominio, moneda } = await condominioVisible(id);
  const gastos = await db.gasto.findMany({
    where: { periodo: { condominioId: id }, tipo: "COMUN" },
    orderBy: [{ fecha: "desc" }, { creadoEn: "desc" }],
    include: {
      periodo: { select: { id: true, anio: true, mes: true } },
      fondo: { select: { nombre: true } },
      _count: { select: { respaldos: true } },
      conciliaciones: { where: { anuladaEn: null }, select: { id: true } },
    },
  });
  const $ = (n: number | { toString(): string }) => formatoMoneda(n, moneda);
  const porPagar = gastos.filter((g) => g.estadoPago === "POR_PAGAR");
  const sinCartola = gastos.filter((g) => g.estadoPago === "PAGADO" && g.conciliaciones.length === 0 && g.medioPago !== "EFECTIVO");
  const sinRespaldo = gastos.filter((g) => g._count.respaldos === 0);
  const suma = (l: typeof gastos) => l.reduce((s, g) => s + Number(g.monto), 0);
  const visibles = filtro === "por-pagar" ? porPagar : filtro === "sin-cartola" ? sinCartola : filtro === "sin-respaldo" ? sinRespaldo : gastos;
  const tarjeta = (clave: string, titulo: string, lista: typeof gastos, ayuda: string) => (
    <Link href={`?estado=${filtro === clave ? "" : clave}`} className="block">
      <Card className={filtro === clave ? "border-convive" : lista.length ? "border-alerta/40" : undefined}>
        <p className="text-sm text-texto-suave">{titulo}</p>
        <p className="mt-1 text-2xl font-bold tabular-nums">{$(suma(lista))}</p>
        <p className="text-sm text-texto-suave">
          {lista.length} egreso{lista.length === 1 ? "" : "s"} · {ayuda}
        </p>
      </Card>
    </Link>
  );
  return (
    <>
      <PageHeader
        titulo="Egresos"
        descripcion={`${condominio.nombre} · Gastos comunes y su pago a proveedores. Se registran en Gasto común, dentro de cada mes; aquí se paga, se respalda y se concilia.`}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {tarjeta("por-pagar", "Por pagar a proveedores", porPagar, "deuda con proveedores")}
        {tarjeta("sin-cartola", "Pagados sin cartola", sinCartola, "falta encontrarlos en el banco")}
        {tarjeta("sin-respaldo", "Sin respaldo", sinRespaldo, "falta la factura o boleta")}
      </div>
      {visibles.length === 0 ? (
        <Vacio>{gastos.length === 0 ? "Aún no hay gastos comunes registrados. Se cargan en Gasto común, dentro de cada mes." : "No hay egresos en este filtro."}</Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Mes</th>
              <th>Detalle</th>
              <th>Pago</th>
              <th>Banco</th>
              <th>Respaldo</th>
              <th className="text-right">Monto</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((g) => (
              <tr key={g.id}>
                <td className="whitespace-nowrap">{formatoFecha(g.fecha)}</td>
                <td className="whitespace-nowrap">
                  <Link href={`/condominios/${id}/periodos/${g.periodo.id}`} className="text-marca hover:underline">
                    {nombrePeriodo(g.periodo.anio, g.periodo.mes)}
                  </Link>
                </td>
                <td>
                  <Link href={`/condominios/${id}/egresos/${g.id}`} className="font-semibold text-marca hover:underline">
                    {g.descripcion}
                  </Link>
                  <span className="block text-xs text-texto-suave">
                    {[g.categoria, g.proveedor, g.documento && `doc. ${g.documento}`, g.fondo && `pagado con ${g.fondo.nombre}`].filter(Boolean).join(" · ")}
                  </span>
                </td>
                <td>{g.estadoPago === "PAGADO" ? <Insignia tono="exito">Pagado {g.fechaPago ? formatoFecha(g.fechaPago) : ""}</Insignia> : <Insignia tono="alerta">Por pagar</Insignia>}</td>
                <td>{g.conciliaciones.length ? <Insignia tono="exito">Conciliado</Insignia> : <span className="text-sm text-texto-suave">Sin cartola</span>}</td>
                <td className="text-sm">{g._count.respaldos ? `${g._count.respaldos} archivo${g._count.respaldos === 1 ? "" : "s"}` : <span className="text-texto-suave">—</span>}</td>
                <td className="text-right tabular-nums">{$(g.monto)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td colSpan={6}>Total</td>
              <td className="text-right tabular-nums">{$(suma(visibles))}</td>
            </tr>
          </tbody>
        </Tabla>
      )}
    </>
  );
}
