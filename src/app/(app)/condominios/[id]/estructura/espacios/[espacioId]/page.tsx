import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Card, Insignia, Mensaje, PageHeader, Tabla, Vacio } from "@/components/ui";
import {
  CLASES,
  DESTINOS,
  hoyDia,
  propiedadDe,
  REGIMENES,
  revisarEspacio,
  rutaAgrupacion,
  situacionEspacio,
  TIPOS_ASIGNACION,
  vigente,
} from "@/lib/estructura";
import { diaISO } from "@/lib/forms";
import { formatoDia, formatoFechaHora } from "@/lib/formato";
import { condominioVisible } from "../../../condominio-actual";
import { asignarEspacio, eliminarEspacio, guardarEspacio, terminarAsignacion } from "../../../../estructura-actions";
import { opcionesEstructura } from "../../datos";
import { AsignacionForm, BotonAccion, EspacioForm, TerminarAsignacionForm } from "../../formularios";

export default async function EspacioPage({ params, searchParams }: PageProps<"/condominios/[id]/estructura/espacios/[espacioId]">) {
  const { id, espacioId } = await params;
  const { creado } = await searchParams;
  const { condominio, administradoraId, editable } = await condominioVisible(id);
  const e = await db.espacio.findFirst({
    where: { id: espacioId, condominioId: id },
    include: {
      unidadPropia: { select: { numero: true } },
      unidadPrincipal: { select: { numero: true } },
      asignaciones: { orderBy: { desde: "desc" } },
    },
  });
  if (!e) notFound();
  const op = await opcionesEstructura(id, administradoraId);
  const nombre = `${CLASES[e.clase].singular} ${e.codigo}`;
  const hoy = hoyDia();
  const actual = e.asignaciones.find((a) => vigente(a, hoy));
  const sit = situacionEspacio(e, actual ?? null);
  const { advertencias } = revisarEspacio(e);
  const historial = await db.registroCambio.findMany({
    where: { condominioId: id, OR: [{ detalle: { startsWith: `${nombre}:` } }, { detalle: { startsWith: `${nombre} ` } }] },
    orderBy: { creadoEn: "desc" },
    take: 30,
  });

  const filas: [string, string][] = [
    ["Propiedad", propiedadDe(e)],
    ["Condición jurídica", REGIMENES[e.regimen].texto],
    ["Destino", e.destino ? DESTINOS[e.destino] : "Sin indicar"],
    ["Accesible", e.accesible ? "Sí" : "No"],
    ["Ubicación", [rutaAgrupacion(e.agrupacionId, op.agrupaciones), e.ubicacion].filter(Boolean).join(" · ") || "Sin indicar"],
    ["Respaldo", e.respaldo ?? "Sin indicar"],
    ["Uso actual", actual ? `${actual.beneficiario} (${TIPOS_ASIGNACION[actual.tipo].toLowerCase()})` : (sit.quien ?? "Sin asignación vigente")],
  ];

  return (
    <>
      <nav aria-label="Ruta" className="mb-2 text-sm text-texto-suave">
        <Link href={`/condominios/${id}/estructura#espacios`} className="hover:text-marca">
          {condominio.nombre} › Estructura física
        </Link>
      </nav>
      <PageHeader
        titulo={nombre}
        descripcion={<Insignia tono={sit.tono}>{sit.texto}</Insignia>}
        acciones={
          editable &&
          e.asignaciones.length === 0 && (
            <BotonAccion accion={eliminarEspacio.bind(null, id, e.id)} pregunta={`¿Eliminar ${nombre}? Úsalo solo si se registró por error.`}>
              Eliminar
            </BotonAccion>
          )
        }
      />
      {creado && (
        <div className="mb-4">
          <Mensaje tipo="ok" texto={`${nombre} agregado. Ahora puedes registrar quién lo usa.`} />
        </div>
      )}

      <div className="grid gap-6">
        <Card>
          <h2 className="mb-3 text-lg font-bold">Ficha</h2>
          <dl className="grid gap-2 text-sm sm:grid-cols-[10rem_1fr]">
            {filas.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-texto-suave">{k}</dt>
                <dd className="font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          {e.observaciones && <p className="mt-3 text-sm whitespace-pre-line">{e.observaciones}</p>}
          {advertencias.length > 0 && (
            <ul className="mt-4 list-disc rounded-xl bg-alerta-suave py-2 pr-3 pl-7 text-sm text-alerta">
              {advertencias.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-1 text-lg font-bold">Asignaciones de uso</h2>
          <p className="mb-3 text-sm text-texto-suave">
            Quién lo usa y desde cuándo. Asignar el uso no cambia la propiedad. Las asignaciones terminadas quedan en el historial.
          </p>
          {e.asignaciones.length === 0 ? (
            <Vacio>Sin asignaciones registradas.</Vacio>
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <th>A</th>
                  <th>Período</th>
                  <th>Respaldo</th>
                  {editable && <th>Terminar</th>}
                </tr>
              </thead>
              <tbody>
                {e.asignaciones.map((a) => {
                  const abierta = !a.hasta || a.hasta >= hoy;
                  return (
                    <tr key={a.id}>
                      <td>
                        <span className="font-semibold">{a.beneficiario}</span>
                        <span className="block text-xs text-texto-suave">
                          {TIPOS_ASIGNACION[a.tipo]}
                          {vigente(a, hoy) ? " · vigente" : a.desde > hoy ? " · futura" : " · terminada"}
                        </span>
                      </td>
                      <td>
                        {formatoDia(a.desde)} → {a.hasta ? formatoDia(a.hasta) : "sin término"}
                        <span className="block text-xs text-texto-suave">
                          Registró {a.creadoPor}
                          {a.terminadaPor ? `; terminó ${a.terminadaPor}` : ""}
                        </span>
                      </td>
                      <td>{a.respaldo ?? "—"}</td>
                      {editable && (
                        <td>{abierta ? <TerminarAsignacionForm accion={terminarAsignacion.bind(null, id, a.id)} hoy={diaISO(hoy)} /> : "—"}</td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </Tabla>
          )}
          {editable && e.estado !== "FUERA_DE_USO" && (
            <div className="mt-5 border-t border-borde pt-4">
              <h3 className="mb-3 font-bold">Nueva asignación</h3>
              <AsignacionForm
                accion={asignarEspacio.bind(null, id, e.id)}
                unidades={op.opcionesUnidad}
                personas={op.opcionesPersona}
                hoy={diaISO(hoy)}
              />
            </div>
          )}
        </Card>
      </div>

      {editable && (
        <Card className="mt-6 max-w-3xl">
          <h2 className="mb-3 text-lg font-bold">Editar datos</h2>
          <EspacioForm
            accion={guardarEspacio.bind(null, id, e.id)}
            valores={{ ...e, fueraDeUso: e.estado === "FUERA_DE_USO" }}
            agrupaciones={op.opcionesAgrupacion}
            unidades={op.opcionesUnidad}
            textoBoton="Guardar cambios"
          />
        </Card>
      )}

      <Card className="mt-6 mb-20 md:mb-0">
        <h2 className="mb-3 text-lg font-bold">Historial de cambios</h2>
        {historial.length === 0 ? (
          <p className="text-sm text-texto-suave">Sin cambios registrados.</p>
        ) : (
          <ul className="grid gap-2 text-sm">
            {historial.map((h) => (
              <li key={h.id}>
                <span className="text-texto-suave">{formatoFechaHora(h.creadoEn)} · {h.usuarioNombre}:</span> {h.accion}: {h.detalle.slice(nombre.length).replace(/^[: ]+/, "")}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
