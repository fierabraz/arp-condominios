import Link from "next/link";
import { requireAdministradora } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader, Tabla, Vacio } from "@/components/ui";
import { PersonaForm } from "./persona-form";
import { crearPersona } from "./actions";

export default async function PersonasPage() {
  const { administradoraId } = await requireAdministradora();
  const personas = await db.persona.findMany({
    where: { administradoraId },
    orderBy: { nombre: "asc" },
    include: {
      unidades: { include: { unidad: { include: { condominio: { select: { nombre: true } } } } } },
    },
  });

  return (
    <>
      <PageHeader titulo="Propietarios y residentes" descripcion="Personas vinculadas a las unidades de tus propiedades" />
      <Card className="mb-6">
        <h2 className="mb-4 font-medium">Registrar persona</h2>
        <PersonaForm accion={crearPersona} textoBoton="Registrar" limpiarAlGuardar />
      </Card>
      {personas.length === 0 ? (
        <Vacio>Aún no hay personas registradas.</Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Documento</th>
              <th>Correo</th>
              <th>Unidades</th>
            </tr>
          </thead>
          <tbody>
            {personas.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link href={`/personas/${p.id}`} className="font-medium text-marca hover:underline">
                    {p.nombre}
                  </Link>
                </td>
                <td>{p.documento ?? "—"}</td>
                <td>{p.correo ?? "—"}</td>
                <td className="text-texto-suave">
                  {p.unidades
                    .map(
                      (v) =>
                        `${v.unidad.condominio.nombre} ${v.unidad.numero} (${v.relacion === "PROPIETARIO" ? "propietario" : "residente"})`,
                    )
                    .join(", ") || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
