import Link from "next/link";
import { db } from "@/lib/db";
import { BotonLink, Insignia, PageHeader, Tabla, Vacio } from "@/components/ui";
import { formatoMoneda } from "@/lib/formato";
import { condominioVisible } from "../../condominio-actual";

export default async function EspaciosReservablesPage({ params }: PageProps<"/condominios/[id]/reservas/espacios">) {
  const { id } = await params;
  const { condominio, editable, moneda } = await condominioVisible(id);
  const espacios = await db.espacioReservable.findMany({
    where: { condominioId: id },
    orderBy: { nombre: "asc" },
    include: { _count: { select: { reservas: true } } },
  });
  const base = `/condominios/${id}/reservas`;
  return (
    <>
      <PageHeader
        titulo="Espacios y reglas"
        descripcion={`${condominio.nombre} · Espacios comunes que los residentes pueden reservar, con sus turnos, costo y reglas.`}
        acciones={
          <>
            <BotonLink href={base} variante="secundario">
              Ver calendario
            </BotonLink>
            {editable && <BotonLink href={`${base}/espacios/nuevo`}>+ Nuevo espacio</BotonLink>}
          </>
        }
      />
      {espacios.length === 0 ? (
        <Vacio>Todavía no hay espacios para reservar. Crea el primero, por ejemplo el quincho o la sala de eventos.</Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th>Espacio</th>
              <th>Turnos</th>
              <th>Costo</th>
              <th>Reglas</th>
              <th className="text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {espacios.map((e) => (
              <tr key={e.id}>
                <td>
                  <span className="font-semibold">{e.nombre}</span>
                  {!e.activo && (
                    <span className="ml-2">
                      <Insignia>Cerrado</Insignia>
                    </span>
                  )}
                  {e.capacidad && <span className="block text-xs text-texto-suave">Hasta {e.capacidad} personas</span>}
                </td>
                <td>{e.turnos.join(" · ")}</td>
                <td className="tabular-nums">{Number(e.costo) > 0 ? formatoMoneda(e.costo, moneda) : "Sin costo"}</td>
                <td className="text-xs text-texto-suave">
                  {[
                    e.requiereAprobacion ? "Requiere aprobación" : "Confirmación inmediata",
                    `hasta ${e.anticipacionMaximaDias} días antes`,
                    e.maximoPorMes ? `máx. ${e.maximoPorMes} al mes por unidad` : null,
                    e.bloquearMorosos ? "sin cobros vencidos" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </td>
                <td className="text-right whitespace-nowrap">
                  <Link href={`${base}?espacio=${e.id}`} className="text-marca hover:underline">
                    Calendario
                  </Link>
                  {editable && (
                    <>
                      {" · "}
                      <Link href={`${base}/espacios/${e.id}`} className="text-marca hover:underline">
                        Editar
                      </Link>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
