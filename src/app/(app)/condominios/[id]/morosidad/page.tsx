import Link from "next/link";
import { Card, PageHeader, Tabla, Vacio } from "@/components/ui";
import { formatoFecha, formatoMoneda } from "@/lib/formato";
import { morosidad } from "@/lib/cobro-servicio";
import { condominioVisible } from "../condominio-actual";
import { NavCondominio } from "../nav-condominio";

export default async function MorosidadPage({ params }: PageProps<"/condominios/[id]/morosidad">) {
  const { id } = await params;
  const { condominio, editable, moneda, administradoraId } = await condominioVisible(id);
  const filas = await morosidad(id, administradoraId);
  const total = filas.reduce((s, f) => s + f.deuda, 0);

  return (
    <>
      <PageHeader titulo={condominio.nombre} descripcion="Unidades con cobros vencidos sin pagar." />
      <NavCondominio id={id} actual="/morosidad" />
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <p className="text-sm text-gray-600">Unidades morosas</p>
          <p className="mt-1 text-2xl font-semibold">{filas.length}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-600">Deuda vencida total</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatoMoneda(total, moneda)}</p>
        </Card>
      </div>
      {filas.length === 0 ? (
        <Vacio>No hay deuda vencida.</Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th>Unidad</th>
              <th className="text-right">Avisos impagos</th>
              <th>Vencido desde</th>
              <th className="text-right">Deuda vencida</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.unidadId}>
                <td className="font-medium">
                  {editable ? (
                    <Link href={`/condominios/${id}/unidades/${f.unidadId}`} className="text-blue-700 hover:underline">
                      {f.numero}
                    </Link>
                  ) : (
                    f.numero
                  )}
                </td>
                <td className="text-right">{f.avisos}</td>
                <td>{formatoFecha(f.desde)}</td>
                <td className="text-right font-medium tabular-nums text-amber-700">{formatoMoneda(f.deuda, moneda)}</td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
