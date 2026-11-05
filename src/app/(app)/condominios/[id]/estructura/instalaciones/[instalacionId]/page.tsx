import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Card, Insignia, PageHeader } from "@/components/ui";
import { ESTADOS_INSTALACION, rutaAgrupacion, TIPOS_INSTALACION } from "@/lib/estructura";
import { condominioVisible } from "../../../condominio-actual";
import { eliminarInstalacion, guardarInstalacion } from "../../../../estructura-actions";
import { opcionesEstructura } from "../../datos";
import { BotonAccion, InstalacionForm } from "../../formularios";

const TONO = { OPERATIVA: "exito", CON_OBSERVACIONES: "alerta", FUERA_DE_SERVICIO: "peligro", SIN_INFORMACION: "neutro" } as const;

export default async function InstalacionPage({ params }: PageProps<"/condominios/[id]/estructura/instalaciones/[instalacionId]">) {
  const { id, instalacionId } = await params;
  const { condominio, administradoraId, editable } = await condominioVisible(id);
  const i = await db.instalacion.findFirst({ where: { id: instalacionId, condominioId: id }, include: { proveedor: { select: { nombre: true } } } });
  if (!i) notFound();
  const op = await opcionesEstructura(id, administradoraId);
  const filas: [string, string][] = [
    ["Tipo", TIPOS_INSTALACION[i.tipo]],
    ["Ubicación", [rutaAgrupacion(i.agrupacionId, op.agrupaciones), i.ubicacion].filter(Boolean).join(" · ") || "Sin indicar"],
    ["Proveedor de mantención", i.proveedor?.nombre ?? "Sin indicar"],
    ["Descripción", i.descripcion ?? "Sin indicar"],
    ["Observaciones", i.observaciones ?? "—"],
  ];
  return (
    <>
      <nav aria-label="Ruta" className="mb-2 text-sm text-texto-suave">
        <Link href={`/condominios/${id}/estructura#instalaciones`} className="hover:text-marca">
          {condominio.nombre} › Estructura física
        </Link>
      </nav>
      <PageHeader
        titulo={`${i.codigo} · ${i.nombre}`}
        descripcion={<Insignia tono={TONO[i.estado]}>{ESTADOS_INSTALACION[i.estado]}</Insignia>}
        acciones={
          editable && (
            <BotonAccion accion={eliminarInstalacion.bind(null, id, i.id)} pregunta={`¿Eliminar ${i.codigo} ${i.nombre}?`}>
              Eliminar
            </BotonAccion>
          )
        }
      />
      <Card className="mb-6 max-w-3xl">
        <dl className="grid gap-2 text-sm sm:grid-cols-[12rem_1fr]">
          {filas.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-texto-suave">{k}</dt>
              <dd className="font-semibold whitespace-pre-line">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
      {editable && (
        <Card className="mb-20 max-w-3xl md:mb-0">
          <h2 className="mb-3 text-lg font-bold">Editar</h2>
          <InstalacionForm
            accion={guardarInstalacion.bind(null, id, i.id)}
            valores={i}
            agrupaciones={op.opcionesAgrupacion}
            proveedores={op.opcionesProveedor}
            textoBoton="Guardar cambios"
          />
        </Card>
      )}
    </>
  );
}
