import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { BotonLink, Card, PageHeader, Vacio } from "@/components/ui";
import { puede } from "@/lib/permisos";
import { formatoFechaHora } from "@/lib/formato";
import { BotonAccion } from "../../estructura/formularios";
import { condominioVisible } from "../../condominio-actual";
import { actualizarPerfil, eliminarPerfilCartola } from "../../../conciliacion-actions";
import { FormularioPerfil } from "../formularios";

// FIN-003.1 · Perfiles de cartola de la administradora: consultar, editar y eliminar.
// Son de la administradora (sirven para todas sus comunidades) y no guardan movimientos.

export default async function PerfilesCartolaPage({ params }: PageProps<"/condominios/[id]/conciliacion/perfiles">) {
  const { id } = await params;
  const { usuario, administradoraId } = await condominioVisible(id);
  if (!puede(usuario, "banco.importar", id)) notFound();
  const perfiles = await db.perfilCartola.findMany({ where: { administradoraId }, orderBy: [{ banco: "asc" }, { nombre: "asc" }] });

  return (
    <>
      <PageHeader
        titulo="Perfiles de cartola"
        descripcion="Formatos de cartola guardados por tu administradora. Cuando una cartola trae las mismas columnas, se lee sola."
        acciones={
          <BotonLink href={`/condominios/${id}/conciliacion`} variante="secundario">
            Volver a conciliación
          </BotonLink>
        }
      />
      {perfiles.length === 0 ? (
        <Vacio>Todavía no hay perfiles. Se crean desde el asistente de columnas al cargar una cartola.</Vacio>
      ) : (
        <div className="space-y-4">
          {perfiles.map((p) => (
            <Card key={p.id}>
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-bold">
                    {p.banco} — {p.nombre}
                  </h2>
                  <p className="text-sm text-texto-suave">
                    {p.hoja ? `Hoja «${p.hoja}» · ` : ""}Actualizado {formatoFechaHora(p.actualizadoEn)} por {p.creadoPor}
                  </p>
                </div>
                <BotonAccion accion={eliminarPerfilCartola.bind(null, id, p.id)} pregunta={`¿Eliminar el perfil «${p.nombre}»? Los movimientos ya importados no cambian.`}>
                  Eliminar
                </BotonAccion>
              </div>
              <details>
                <summary className="cursor-pointer text-sm font-semibold text-marca">Ver y editar columnas y formatos</summary>
                <div className="mt-4">
                  <FormularioPerfil
                    accion={actualizarPerfil.bind(null, id, p.id)}
                    perfil={{
                      nombre: p.nombre,
                      banco: p.banco,
                      formatoFecha: p.formatoFecha,
                      separadorDecimal: p.separadorDecimal,
                      signoMonto: p.signoMonto,
                      columnas: p.columnas as Record<string, string>,
                    }}
                  />
                </div>
              </details>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
