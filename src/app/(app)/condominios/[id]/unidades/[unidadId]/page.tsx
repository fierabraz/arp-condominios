import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdministradora } from "@/lib/auth";
import { db } from "@/lib/db";
import { Boton, Card, PageHeader, Vacio } from "@/components/ui";
import { UnidadForm } from "../../../unidad-form";
import { desvincularPersona, editarUnidad, eliminarUnidad, vincularPersona } from "../../../actions";
import { VinculoForm } from "./vinculo-form";

export default async function UnidadPage({ params }: PageProps<"/condominios/[id]/unidades/[unidadId]">) {
  const { id, unidadId } = await params;
  const { administradoraId } = await requireAdministradora();

  const [unidad, personas] = await Promise.all([
    db.unidad.findFirst({
      where: { id: unidadId, condominioId: id, administradoraId },
      include: {
        condominio: { select: { nombre: true } },
        personas: { include: { persona: true }, orderBy: { relacion: "asc" } },
      },
    }),
    db.persona.findMany({
      where: { administradoraId },
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true },
    }),
  ]);
  if (!unidad) notFound();

  return (
    <>
      <PageHeader
        titulo={`Unidad ${unidad.numero}`}
        descripcion={
          <Link href={`/condominios/${id}`} className="text-blue-700 hover:underline">
            {unidad.condominio.nombre}
          </Link>
        }
      />

      <Card className="mb-6">
        <h2 className="mb-4 font-medium">Datos de la unidad</h2>
        <UnidadForm
          accion={editarUnidad.bind(null, unidad.id)}
          textoBoton="Guardar"
          valores={{
            numero: unidad.numero,
            tipo: unidad.tipo,
            alicuota: unidad.alicuota.toString(),
          }}
        />
      </Card>

      <Card className="mb-6">
        <h2 className="mb-4 font-medium">Propietarios y residentes</h2>
        {unidad.personas.length === 0 ? (
          <Vacio>Nadie vinculado todavía.</Vacio>
        ) : (
          <ul className="mb-4 divide-y divide-gray-100">
            {unidad.personas.map((v) => (
              <li key={`${v.personaId}-${v.relacion}`} className="flex items-center justify-between py-2 text-sm">
                <span>
                  <span className="font-medium">{v.persona.nombre}</span>
                  <span className="ml-2 text-gray-500">
                    {v.relacion === "PROPIETARIO" ? "Propietario" : "Residente"}
                  </span>
                </span>
                <form action={desvincularPersona.bind(null, unidad.id, v.personaId, v.relacion)}>
                  <button className="text-sm text-red-700 hover:underline">Quitar</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        {personas.length === 0 ? (
          <p className="text-sm text-gray-600">
            Primero registra personas en{" "}
            <Link href="/personas" className="text-blue-700 hover:underline">
              Personas
            </Link>
            .
          </p>
        ) : (
          <VinculoForm accion={vincularPersona.bind(null, unidad.id)} personas={personas} />
        )}
      </Card>

      <form action={eliminarUnidad.bind(null, unidad.id)}>
        <Boton variante="peligro" type="submit">
          Eliminar unidad
        </Boton>
      </form>
    </>
  );
}
