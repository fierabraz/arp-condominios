import { Clock, CircleCheck, CircleX, CircleSlash } from "lucide-react";
import { Card, Insignia } from "@/components/ui";
import { db } from "@/lib/db";
import { RELACIONES } from "@/lib/cuentas-reglas";
import { formatoFechaHora } from "@/lib/formato";
import { cancelar, enviarSolicitud } from "./actions";
import { SolicitudVinculoForm } from "./formulario";

const ESTADOS = {
  PENDIENTE: { texto: "Pendiente de revisión", tono: "alerta", icono: Clock },
  APROBADA: { texto: "Aprobada", tono: "exito", icono: CircleCheck },
  RECHAZADA: { texto: "No aprobada", tono: "peligro", icono: CircleX },
  CANCELADA: { texto: "Cancelada", tono: "neutro", icono: CircleSlash },
} as const;

/** PILOTO-001: las solicitudes de la cuenta para vincularse con unidades, y el formulario para pedir una. */
export async function MisSolicitudes({ usuarioId }: { usuarioId: string }) {
  const solicitudes = await db.solicitudVinculo.findMany({
    where: { usuarioId },
    orderBy: { creadoEn: "desc" },
    take: 20,
    include: { condominio: { select: { nombre: true } }, unidad: { select: { numero: true } } },
  });
  return (
    <div className="space-y-4">
      {solicitudes.length > 0 && (
        <ul className="space-y-3" aria-label="Mis solicitudes">
          {solicitudes.map((s) => {
            const e = ESTADOS[s.estado];
            return (
              <li key={s.id}>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-convive-oscuro">{s.condominio.nombre}</p>
                      <p className="text-sm text-texto-suave">
                        Unidad: {s.unidad?.numero ?? s.unidadTexto} · {RELACIONES[s.relacion].texto} · enviada el {formatoFechaHora(s.creadoEn)}
                      </p>
                      {s.estado === "PENDIENTE" && (
                        <p className="mt-1 text-sm">La administración de tu comunidad debe confirmar tu unidad. Te avisaremos por correo.</p>
                      )}
                      {s.estado === "APROBADA" && <p className="mt-1 text-sm">Ya puedes ver la información de tu unidad en Inicio.</p>}
                      {s.estado === "RECHAZADA" && s.motivo && <p className="mt-1 text-sm">Motivo: {s.motivo}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Insignia tono={e.tono}>
                        <e.icono size={14} aria-hidden="true" className="mr-1 inline" />
                        {e.texto}
                      </Insignia>
                      {s.estado === "PENDIENTE" && (
                        <form action={cancelar.bind(null, s.id)}>
                          <button className="min-h-11 px-2 text-sm text-peligro hover:underline">Cancelar</button>
                        </form>
                      )}
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <Card>
        <h2 className="mb-1 text-lg font-bold">Solicitar acceso a una unidad</h2>
        <p className="mb-4 text-sm text-texto-suave">
          Escribe el código de tu comunidad (pídelo a tu administración) y tu unidad. Nadie obtiene acceso solo por conocer el
          número de una unidad: la administración revisa cada solicitud.
        </p>
        <SolicitudVinculoForm accion={enviarSolicitud} />
      </Card>
    </div>
  );
}
