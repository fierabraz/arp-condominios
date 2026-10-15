import { requireUsuario } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader, Tabla, Vacio } from "@/components/ui";
import { AdministradoraForm } from "./administradora-form";
import { crearAdministradora } from "./actions";

export default async function PlataformaPage() {
  await requireUsuario(["SUPERADMIN"]);
  const administradoras = await db.administradora.findMany({
    orderBy: { creadoEn: "desc" },
    include: { _count: { select: { condominios: true, unidades: true, usuarios: true } } },
  });

  return (
    <>
      <PageHeader titulo="Administradoras" descripcion="Clientes que usan la plataforma" />
      <Card className="mb-6">
        <h2 className="mb-4 font-medium">Nueva administradora</h2>
        <AdministradoraForm accion={crearAdministradora} />
      </Card>
      {administradoras.length === 0 ? (
        <Vacio>Aún no hay administradoras.</Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>País</th>
              <th>Moneda</th>
              <th className="text-right">Condominios</th>
              <th className="text-right">Unidades</th>
              <th className="text-right">Usuarios</th>
            </tr>
          </thead>
          <tbody>
            {administradoras.map((a) => (
              <tr key={a.id}>
                <td className="font-medium">{a.nombre}</td>
                <td>{a.pais}</td>
                <td>{a.moneda}</td>
                <td className="text-right">{a._count.condominios}</td>
                <td className="text-right">{a._count.unidades}</td>
                <td className="text-right">{a._count.usuarios}</td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
