import { Download } from "lucide-react";
import { requirePermiso } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, Vacio } from "@/components/ui";
import { nombrePeriodo } from "@/lib/cobro";
import { unidadesVisibles } from "../../datos-residente";

export default async function DocumentosPage({ searchParams }: PageProps<"/mi-cuenta/documentos">) {
  const usuario = await requirePermiso("portal.residente");
  const { condominioIds } = await unidadesVisibles(usuario, (await searchParams).unidad);
  const rendiciones = await db.periodo.findMany({
    where: { condominioId: { in: condominioIds }, estado: "CERRADO" },
    orderBy: [{ anio: "desc" }, { mes: "desc" }],
    take: 24,
    include: { condominio: { select: { nombre: true } } },
  });
  return (
    <>
      <PageHeader titulo="Rendiciones" descripcion="En qué se gastó el dinero de la comunidad cada mes." />
      {rendiciones.length === 0 ? (
        <Vacio>Todavía no hay rendiciones. Aparecen cuando la administración cierra cada mes.</Vacio>
      ) : (
        <ul className="sombra-convive divide-y divide-borde overflow-hidden rounded-2xl border border-borde bg-white">
          {rendiciones.map((r) => (
            <li key={r.id}>
              <a
                href={`/rendiciones/${r.id}/pdf`}
                target="_blank"
                rel="noopener"
                className="flex min-h-14 items-center justify-between gap-3 px-5 py-3 hover:bg-fondo"
              >
                <span>
                  <span className="font-semibold">Rendición de {nombrePeriodo(r.anio, r.mes).toLowerCase()}</span>
                  {condominioIds.length > 1 && <span className="block text-sm text-texto-suave">{r.condominio.nombre}</span>}
                </span>
                <Download size={20} className="shrink-0 text-convive-oscuro" aria-label="Descargar PDF" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
