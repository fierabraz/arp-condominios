import Link from "next/link";
import { requireAdministradora } from "@/lib/auth";
import { db } from "@/lib/db";
import { BotonLink, PageHeader, Tabla, Vacio } from "@/components/ui";
import { formatoPorcentaje } from "@/lib/formato";

export default async function CondominiosPage() {
  const { administradoraId } = await requireAdministradora();
  const condominios = await db.condominio.findMany({
    where: { administradoraId },
    orderBy: { nombre: "asc" },
    include: { _count: { select: { unidades: true } } },
  });

  return (
    <>
      <PageHeader
        titulo="Mis propiedades"
        descripcion="Edificios y condominios que administras"
        acciones={<BotonLink href="/condominios/nuevo">Crear propiedad</BotonLink>}
      />
      {condominios.length === 0 ? (
        <Vacio>Aún no tienes propiedades. Crea la primera para empezar.</Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Dirección</th>
              <th className="text-right">Unidades</th>
              <th className="text-right">Fondo de reserva</th>
            </tr>
          </thead>
          <tbody>
            {condominios.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link href={`/condominios/${c.id}`} className="font-medium text-blue-700 hover:underline">
                    {c.nombre}
                  </Link>
                </td>
                <td className="text-gray-600">
                  {c.direccion}
                  {c.comuna ? `, ${c.comuna}` : ""}
                </td>
                <td className="text-right">{c._count.unidades}</td>
                <td className="text-right">{formatoPorcentaje(c.porcentajeReserva, 2)}</td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
