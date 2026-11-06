import Link from "next/link";
import { requirePermiso } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, Insignia, PageHeader, Tabla, Vacio } from "@/components/ui";
import { calcularCupo, textoCupo } from "@/lib/planes";
import { AdministradoraForm } from "./administradora-form";
import { crearAdministradora } from "./actions";

export default async function PlataformaPage() {
  await requirePermiso("plataforma");
  const [administradoras, planes] = await Promise.all([
    db.administradora.findMany({
      orderBy: { creadoEn: "desc" },
      include: {
        plan: { select: { nombre: true, maxComunidades: true } },
        _count: { select: { condominios: true, unidades: true, usuarios: true } },
      },
    }),
    db.plan.findMany({ where: { activo: true }, orderBy: [{ orden: "asc" }, { nombre: "asc" }] }),
  ]);

  return (
    <>
      <PageHeader
        titulo="Administradoras"
        descripcion="Clientes que usan la plataforma y el plan que tiene cada uno"
        acciones={
          <Link href="/plataforma/planes" className="text-sm font-semibold text-marca underline">
            Editar planes
          </Link>
        }
      />
      <Card className="mb-6">
        <h2 className="mb-4 font-medium">Nueva administradora</h2>
        <AdministradoraForm
          accion={crearAdministradora}
          planes={planes.map((p) => ({ id: p.id, texto: `${p.nombre} · ${p.maxComunidades === null ? "sin límite" : `hasta ${p.maxComunidades}`}` }))}
        />
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
              <th>Plan</th>
              <th className="text-right">Comunidades</th>
              <th className="text-right">Unidades</th>
              <th className="text-right">Usuarios</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {administradoras.map((a) => {
              const cupo = calcularCupo(a, a._count.condominios);
              return (
              <tr key={a.id}>
                <td className="font-medium">{a.nombre}</td>
                <td>{a.pais}</td>
                <td>{a.moneda}</td>
                <td>
                  {a.plan?.nombre ?? <span className="text-texto-suave">Sin plan</span>}
                  {!a.creaComunidades && (
                    <>
                      {" "}
                      <Insignia tono="alerta">No crea comunidades</Insignia>
                    </>
                  )}
                </td>
                <td className="text-right tabular-nums">
                  {textoCupo(cupo)}
                  {cupo.limite !== null && cupo.restantes === 0 && (
                    <>
                      {" "}
                      <Insignia tono="alerta">Lleno</Insignia>
                    </>
                  )}
                </td>
                <td className="text-right">{a._count.unidades}</td>
                <td className="text-right">{a._count.usuarios}</td>
                <td className="text-right">
                  <Link href={`/plataforma/administradoras/${a.id}`} className="font-semibold text-marca underline">
                    Cambiar plan
                  </Link>
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
