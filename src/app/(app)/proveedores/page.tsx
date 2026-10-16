import { requireAdministradora } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader, Tabla, Vacio } from "@/components/ui";
import { formatoMoneda } from "@/lib/formato";
import { ProveedorForm } from "./proveedor-form";
import { crearProveedor, eliminarProveedor } from "./actions";

export default async function ProveedoresPage() {
  const { usuario, administradoraId } = await requireAdministradora();
  const [proveedores, gastado] = await Promise.all([
    db.proveedor.findMany({ where: { administradoraId }, orderBy: { nombre: "asc" } }),
    db.gasto.groupBy({
      by: ["proveedor"],
      where: { administradoraId, proveedor: { not: null } },
      _sum: { monto: true },
      _count: true,
    }),
  ]);
  const porNombre = new Map(gastado.map((g) => [g.proveedor!.toLowerCase(), g]));
  const moneda = usuario.administradora?.moneda ?? "CLP";

  return (
    <>
      <PageHeader
        titulo="Catálogo de proveedores"
        descripcion="Empresas y personas que prestan servicios a tus propiedades. Aparecen como sugerencia al cargar un gasto."
      />
      <Card className="mb-6">
        <h2 className="mb-4 font-medium">Nuevo proveedor</h2>
        <ProveedorForm accion={crearProveedor} />
      </Card>
      {proveedores.length === 0 ? (
        <Vacio>Aún no hay proveedores en el catálogo.</Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th>Proveedor</th>
              <th>Rubro</th>
              <th>Contacto</th>
              <th className="text-right">Gastos</th>
              <th className="text-right">Total facturado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {proveedores.map((p) => {
              const g = porNombre.get(p.nombre.toLowerCase());
              return (
                <tr key={p.id}>
                  <td>
                    <p className="font-medium">{p.nombre}</p>
                    {p.rut && <p className="text-xs text-texto-suave">RUT {p.rut}</p>}
                  </td>
                  <td>{p.rubro ?? "—"}</td>
                  <td className="text-texto-suave">
                    {[p.contacto, p.telefono, p.correo].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="text-right">{g?._count ?? 0}</td>
                  <td className="text-right tabular-nums">{formatoMoneda(g?._sum.monto ?? 0, moneda)}</td>
                  <td className="text-right">
                    <form action={eliminarProveedor.bind(null, p.id)}>
                      <button className="text-sm text-peligro hover:underline">Quitar</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
