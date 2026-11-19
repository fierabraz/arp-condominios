import { requirePermiso } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, Insignia, PageHeader } from "@/components/ui";
import { crearPlan, editarPlan } from "./actions";
import { PlanForm } from "./formularios";

export default async function PlanesPage() {
  await requirePermiso("plataforma");
  const planes = await db.plan.findMany({
    orderBy: [{ orden: "asc" }, { nombre: "asc" }],
    include: { _count: { select: { administradoras: true } } },
  });

  return (
    <>
      <PageHeader
        titulo="Planes"
        descripcion="Cuántas comunidades puede crear cada administradora. Los nombres y cupos son editables; aquí no hay precios ni cobros: el plan se asigna a mano en Administradoras."
      />
      <div className="grid gap-4">
        {planes.map((p) => (
          <Card key={p.id}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">{p.nombre}</h2>
              <Insignia tono="marca">{p.maxComunidades === null ? "Sin límite" : `Hasta ${p.maxComunidades}`}</Insignia>
              {!p.activo && <Insignia>Inactivo</Insignia>}
              <span className="text-sm text-texto-suave">
                · {p._count.administradoras} {p._count.administradoras === 1 ? "administradora" : "administradoras"}
              </span>
            </div>
            <PlanForm accion={editarPlan.bind(null, p.id)} inicial={p} textoBoton="Guardar cambios" />
          </Card>
        ))}
        <Card>
          <h2 className="mb-4 font-medium">Nuevo plan</h2>
          <PlanForm accion={crearPlan} textoBoton="Crear plan" />
        </Card>
      </div>
    </>
  );
}
