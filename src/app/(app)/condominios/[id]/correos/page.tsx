import { db } from "@/lib/db";
import { PageHeader, Tabla, Vacio } from "@/components/ui";
import { nombrePeriodo } from "@/lib/cobro";
import { condominioVisible } from "../condominio-actual";

const ESTADOS = {
  ENVIADO: { texto: "Enviado", clase: "bg-emerald-50 text-emerald-700" },
  SIMULADO: { texto: "Prueba", clase: "bg-gray-100 text-gray-700" },
  ERROR: { texto: "Error", clase: "bg-red-50 text-red-700" },
} as const;

const fechaHora = (d: Date) =>
  new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santiago" }).format(d);

export default async function CorreosPage({ params }: PageProps<"/condominios/[id]/correos">) {
  const { id } = await params;
  const { condominio } = await condominioVisible(id);
  const envios = await db.envioAviso.findMany({
    where: { aviso: { unidad: { condominioId: id } } },
    orderBy: { creadoEn: "desc" },
    take: 500,
    include: { aviso: { select: { unidad: { select: { numero: true } }, periodo: { select: { anio: true, mes: true } } } } },
  });
  return (
    <>
      <PageHeader
        titulo="Registro de correos"
        descripcion={`${condominio.nombre} · Avisos de cobro enviados por correo. Se envían desde cada mes cerrado en Gasto común.`}
      />
      {envios.length === 0 ? (
        <Vacio>Aún no se han enviado correos.</Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Mes</th>
              <th>Unidad</th>
              <th>Destinatario</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {envios.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap">{fechaHora(e.creadoEn)}</td>
                <td>{nombrePeriodo(e.aviso.periodo.anio, e.aviso.periodo.mes)}</td>
                <td>{e.aviso.unidad.numero}</td>
                <td>{e.destinatario}</td>
                <td>
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${ESTADOS[e.estado].clase}`} title={e.error ?? undefined}>
                    {ESTADOS[e.estado].texto}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
