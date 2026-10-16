import { db } from "@/lib/db";
import { Card, PageHeader, Tabla, Vacio } from "@/components/ui";
import { ETIQUETAS_MEDIO_PAGO, formatoFecha, formatoMoneda, hoyISO } from "@/lib/formato";
import { eliminarPago, nuevoPago } from "../../cobro-actions";
import { condominioVisible } from "../condominio-actual";
import { PagoForm } from "./pago-form";

export default async function PagosPage({ params }: PageProps<"/condominios/[id]/pagos">) {
  const { id } = await params;
  const { condominio, editable, moneda } = await condominioVisible(id);
  const $ = (n: number | { toString(): string }) => formatoMoneda(n, moneda);

  const [unidades, pagos] = await Promise.all([
    db.unidad.findMany({
      where: { condominioId: id },
      orderBy: { numero: "asc" },
      select: { id: true, numero: true, avisos: { where: { saldo: { gt: 0 } }, select: { saldo: true } } },
    }),
    db.pago.findMany({
      where: { unidad: { condominioId: id } },
      orderBy: [{ fecha: "desc" }, { creadoEn: "desc" }],
      take: 100,
      include: { unidad: { select: { numero: true } }, aplicaciones: { select: { monto: true } } },
    }),
  ]);

  return (
    <>
      <PageHeader titulo="Recaudación" descripcion={`${condominio.nombre} · Cada pago se aplica primero a la deuda más antigua de la unidad.`} />
      {editable && (
        <Card className="mb-6">
          <h2 className="mb-4 font-medium">Registrar pago</h2>
          <PagoForm
            accion={nuevoPago.bind(null, id)}
            fecha={hoyISO()}
            unidades={unidades
              .map((u) => ({
                id: u.id,
                numero: u.numero,
                deuda: $(u.avisos.reduce((s, a) => s + Number(a.saldo), 0)),
              }))
              .sort((a, b) => a.numero.localeCompare(b.numero, "es", { numeric: true }))}
          />
        </Card>
      )}
      {pagos.length === 0 ? (
        <Vacio>Aún no hay pagos registrados.</Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Unidad</th>
              <th>Medio</th>
              <th>Referencia</th>
              <th className="text-right">Monto</th>
              <th className="text-right">A favor</th>
              {editable && <th></th>}
            </tr>
          </thead>
          <tbody>
            {pagos.map((p) => {
              const aFavor = Number(p.monto) - p.aplicaciones.reduce((s, a) => s + Number(a.monto), 0);
              return (
                <tr key={p.id}>
                  <td className="whitespace-nowrap">{formatoFecha(p.fecha)}</td>
                  <td className="font-medium">{p.unidad.numero}</td>
                  <td>{ETIQUETAS_MEDIO_PAGO[p.medio]}</td>
                  <td className="text-gray-600">{p.referencia ?? "—"}</td>
                  <td className="text-right tabular-nums">{$(p.monto)}</td>
                  <td className="text-right tabular-nums">{aFavor > 0.004 ? $(aFavor) : "—"}</td>
                  {editable && (
                    <td className="text-right">
                      <form action={eliminarPago.bind(null, p.id)}>
                        <button className="text-sm text-red-700 hover:underline">Anular</button>
                      </form>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
