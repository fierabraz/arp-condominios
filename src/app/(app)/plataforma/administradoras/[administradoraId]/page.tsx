import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermiso } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { textoCupo } from "@/lib/planes";
import { cupoDe } from "@/lib/planes-servicio";
import { asignarPlan } from "../../planes/actions";
import { PlanAdministradoraForm } from "../../planes/formularios";

const textoPlan = (p: { nombre: string; maxComunidades: number | null; activo: boolean }) =>
  `${p.nombre} · ${p.maxComunidades === null ? "sin límite" : `hasta ${p.maxComunidades}`}${p.activo ? "" : " (inactivo)"}`;

export default async function AdministradoraPlanPage({ params }: PageProps<"/plataforma/administradoras/[administradoraId]">) {
  await requirePermiso("plataforma");
  const { administradoraId } = await params;
  const a = await db.administradora.findUnique({ where: { id: administradoraId } });
  if (!a) notFound();
  const [planes, cupo] = await Promise.all([
    db.plan.findMany({ where: { OR: [{ activo: true }, { id: a.planId ?? "" }] }, orderBy: [{ orden: "asc" }, { nombre: "asc" }] }),
    cupoDe(a.id),
  ]);

  return (
    <>
      <nav aria-label="Ruta" className="mb-2 text-sm text-texto-suave">
        <Link href="/plataforma" className="hover:text-marca">
          Administradoras
        </Link>
        <span aria-hidden="true"> › </span>
        <span>{a.nombre}</span>
      </nav>
      <PageHeader titulo={a.nombre} descripcion={`Comunidades: ${textoCupo(cupo)}${cupo.plan ? ` · plan ${cupo.plan}` : " · sin plan"}`} />
      <Card>
        <h2 className="mb-1 font-medium">Plan y creación de comunidades</h2>
        <p className="mb-4 text-sm text-texto-suave">
          Bajar de plan no borra comunidades: si ya tiene más que el nuevo límite, solo deja de poder crear nuevas.{" "}
          <Link href="/plataforma/planes" className="font-semibold text-marca underline">
            Editar nombres y cupos de los planes
          </Link>
        </p>
        <PlanAdministradoraForm
          accion={asignarPlan.bind(null, a.id)}
          planes={planes.map((p) => ({ id: p.id, texto: textoPlan(p) }))}
          inicial={{ planId: a.planId, creaComunidades: a.creaComunidades }}
        />
      </Card>
    </>
  );
}
