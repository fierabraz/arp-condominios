import Link from "next/link";
import { requireAdministradora } from "@/lib/auth";
import { db } from "@/lib/db";
import { BotonDocumento, Card, PageHeader, Tabla, Vacio } from "@/components/ui";
import { formatoMoneda, formatoPorcentaje } from "@/lib/formato";
import { nombrePeriodo } from "@/lib/cobro";

const n = (x: { toString(): string } | null | undefined) => Number(x?.toString() ?? 0);
const redondear = (x: number) => Math.round(x * 100) / 100;

export default async function ReportesPage() {
  const { usuario, administradoraId } = await requireAdministradora();
  const moneda = usuario.administradora?.moneda ?? "CLP";
  const $ = (x: number) => formatoMoneda(x, moneda);
  const ahora = new Date();

  const condominios = await db.condominio.findMany({
    where: { administradoraId },
    orderBy: { nombre: "asc" },
    include: {
      _count: { select: { unidades: true } },
      periodos: {
        where: { estado: "CERRADO" },
        orderBy: [{ anio: "desc" }, { mes: "desc" }],
        take: 1,
        include: { avisos: { select: { total: true, saldo: true } } },
      },
    },
  });
  const vencidos = await db.avisoCobro.findMany({
    where: { administradoraId, saldo: { gt: 0 }, vencimiento: { lt: ahora } },
    select: { saldo: true, unidadId: true, unidad: { select: { condominioId: true } } },
  });

  const filas = condominios.map((c) => {
    const ultimo = c.periodos[0];
    const emitido = redondear(ultimo?.avisos.reduce((s, a) => s + n(a.total), 0) ?? 0);
    const pendiente = redondear(ultimo?.avisos.reduce((s, a) => s + n(a.saldo), 0) ?? 0);
    const recaudado = redondear(emitido - pendiente);
    const propios = vencidos.filter((v) => v.unidad.condominioId === c.id);
    return {
      id: c.id,
      nombre: c.nombre,
      unidades: c._count.unidades,
      ultimo,
      emitido,
      recaudado,
      cobranza: emitido > 0 ? (recaudado / emitido) * 100 : null,
      deudaVencida: redondear(propios.reduce((s, v) => s + n(v.saldo), 0)),
      morosos: new Set(propios.map((v) => v.unidadId)).size,
    };
  });
  const total = {
    unidades: filas.reduce((s, f) => s + f.unidades, 0),
    emitido: redondear(filas.reduce((s, f) => s + f.emitido, 0)),
    recaudado: redondear(filas.reduce((s, f) => s + f.recaudado, 0)),
    deudaVencida: redondear(filas.reduce((s, f) => s + f.deudaVencida, 0)),
    morosos: filas.reduce((s, f) => s + f.morosos, 0),
  };
  const cobranzaTotal = total.emitido > 0 ? (total.recaudado / total.emitido) * 100 : null;

  const tarjetas = [
    { titulo: "Emitido (último mes cerrado)", valor: $(total.emitido) },
    { titulo: "Recaudado", valor: $(total.recaudado) },
    { titulo: "Cobranza", valor: cobranzaTotal === null ? "—" : formatoPorcentaje(cobranzaTotal, 1) },
    { titulo: "Deuda vencida", valor: $(total.deudaVencida) },
    { titulo: "Unidades morosas", valor: `${total.morosos} de ${total.unidades}` },
  ];

  return (
    <>
      <PageHeader titulo="Reportes globales" descripcion="Cobranza y morosidad de todas tus propiedades en un solo lugar" />
      {filas.length === 0 ? (
        <Vacio>Cuando crees propiedades y cierres su primer mes, aquí verás su cobranza.</Vacio>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {tarjetas.map((t) => (
              <Card key={t.titulo}>
                <p className="text-sm text-gray-600">{t.titulo}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{t.valor}</p>
              </Card>
            ))}
          </div>
          <Tabla>
            <thead>
              <tr>
                <th>Propiedad</th>
                <th>Último mes cerrado</th>
                <th className="text-right">Emitido</th>
                <th className="text-right">Recaudado</th>
                <th className="text-right">Cobranza</th>
                <th className="text-right">Deuda vencida</th>
                <th className="text-right">Morosos</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id}>
                  <td>
                    <Link href={`/condominios/${f.id}`} className="font-medium text-blue-700 hover:underline">
                      {f.nombre}
                    </Link>
                  </td>
                  <td>{f.ultimo ? nombrePeriodo(f.ultimo.anio, f.ultimo.mes) : "—"}</td>
                  <td className="text-right tabular-nums">{$(f.emitido)}</td>
                  <td className="text-right tabular-nums">{$(f.recaudado)}</td>
                  <td className="text-right">{f.cobranza === null ? "—" : formatoPorcentaje(f.cobranza, 1)}</td>
                  <td className="text-right tabular-nums">
                    {f.deudaVencida > 0 ? (
                      <Link href={`/condominios/${f.id}/morosidad`} className="text-red-700 hover:underline">
                        {$(f.deudaVencida)}
                      </Link>
                    ) : (
                      $(0)
                    )}
                  </td>
                  <td className="text-right">
                    {f.morosos} / {f.unidades}
                  </td>
                  <td className="text-right">
                    {f.ultimo && (
                      <BotonDocumento href={`/rendiciones/${f.ultimo.id}/pdf`} className="!px-3 !py-1 text-xs">
                        Rendición
                      </BotonDocumento>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        </>
      )}
    </>
  );
}
