import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { BotonLink, Card, Insignia, PageHeader, Tabla, Vacio } from "@/components/ui";
import {
  asignacionVigente,
  CLASES,
  DESTINOS,
  ESTADOS_INSTALACION,
  nombreAgrupacion,
  propiedadDe,
  REGIMENES,
  rutaAgrupacion,
  situacionEspacio,
  TIPOS_INSTALACION,
} from "@/lib/estructura";
import { condominioVisible } from "../condominio-actual";
import { crearAgrupacion, eliminarAgrupacion } from "../../estructura-actions";
import { opcionesEstructura } from "./datos";
import { AgrupacionForm, BotonAccion } from "./formularios";

const TONO_INSTALACION = { OPERATIVA: "exito", CON_OBSERVACIONES: "alerta", FUERA_DE_SERVICIO: "peligro", SIN_INFORMACION: "neutro" } as const;

type Filtrable = { clase: string; accesible: boolean; destino: string | null };
const FILTROS: Record<string, { texto: string; cumple: (e: Filtrable) => boolean }> = {
  todos: { texto: "Todos", cumple: () => true },
  estacionamientos: { texto: "Estacionamientos", cumple: (e) => e.clase === "ESTACIONAMIENTO" },
  bodegas: { texto: "Bodegas", cumple: (e) => e.clase === "BODEGA" },
  accesibles: { texto: "Accesibles", cumple: (e) => e.accesible },
  visitas: { texto: "Visitas", cumple: (e) => e.destino === "VISITAS" },
};

export default async function EstructuraPage({ params, searchParams }: PageProps<"/condominios/[id]/estructura">) {
  const { id } = await params;
  const f = (await searchParams).filtro;
  const filtro = typeof f === "string" && f in FILTROS ? f : "todos";
  const { condominio, administradoraId, editable } = await condominioVisible(id);
  const base = `/condominios/${id}/estructura`;

  const [op, espacios, instalaciones, unidadesPorAgrupacion] = await Promise.all([
    opcionesEstructura(id, administradoraId),
    db.espacio.findMany({
      where: { condominioId: id },
      include: {
        unidadPropia: { select: { numero: true } },
        unidadPrincipal: { select: { numero: true } },
        asignaciones: { select: { desde: true, hasta: true, beneficiario: true } },
      },
    }),
    db.instalacion.findMany({ where: { condominioId: id }, orderBy: [{ tipo: "asc" }, { codigo: "asc" }] }),
    db.unidad.groupBy({ by: ["agrupacionId"], where: { condominioId: id }, _count: true }),
  ]);
  espacios.sort((a, b) => a.clase.localeCompare(b.clase) || a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
  const nUnidades = new Map(unidadesPorAgrupacion.map((u) => [u.agrupacionId, u._count]));
  const visibles = espacios.filter((e) => FILTROS[filtro].cumple(e));
  const contar = (clase: "ESTACIONAMIENTO" | "BODEGA") => espacios.filter((e) => e.clase === clase).length;

  return (
    <>
      <nav aria-label="Ruta" className="mb-2 text-sm text-texto-suave">
        <Link href={`/condominios/${id}`} className="hover:text-marca">
          {condominio.nombre}
        </Link>
        <span aria-hidden="true"> › </span>
        <span>Estructura física</span>
      </nav>
      <PageHeader
        titulo="Estructura física"
        descripcion="Cómo está organizada la propiedad: torres, sectores y pisos; estacionamientos y bodegas; y sus instalaciones."
      />

      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {[
          ["Torres, sectores y pisos", op.agrupaciones.length, "#agrupaciones"],
          ["Estacionamientos", contar("ESTACIONAMIENTO"), "#espacios"],
          ["Bodegas", contar("BODEGA"), "#espacios"],
          ["Instalaciones", instalaciones.length, "#instalaciones"],
        ].map(([texto, n, href]) => (
          <a key={texto as string} href={href as string} className="sombra-convive rounded-2xl border border-borde bg-white p-5 hover:border-convive">
            <p className="text-sm text-texto-suave">{texto}</p>
            <p className="mt-1 text-2xl font-bold text-convive-oscuro">{n}</p>
          </a>
        ))}
      </div>

      {/* ── Agrupaciones ── */}
      <section aria-labelledby="agrupaciones" className="mb-10">
        <h2 id="agrupaciones" className="mb-1 scroll-mt-24 text-xl font-bold">
          Torres, sectores y pisos
        </h2>
        <p className="mb-4 text-sm text-texto-suave">
          Opcional: úsalo solo si la propiedad se divide así. Después puedes ubicar cada unidad, estacionamiento o instalación.
        </p>
        {op.arbol.length === 0 ? (
          <Vacio>Aún no hay agrupaciones. Un condominio de casas puede no necesitarlas.</Vacio>
        ) : (
          <Card className="p-0">
            <ul className="divide-y divide-borde">
              {op.arbol.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3" style={{ paddingLeft: `${1.25 + a.nivel * 1.5}rem` }}>
                  <span>
                    <span className="font-semibold">{nombreAgrupacion(a)}</span>
                    <span className="ml-2 text-sm text-texto-suave">
                      {nUnidades.get(a.id) ? `${nUnidades.get(a.id)} ${nUnidades.get(a.id) === 1 ? "unidad" : "unidades"}` : "sin unidades"}
                    </span>
                  </span>
                  {editable && (
                    <BotonAccion accion={eliminarAgrupacion.bind(null, id, a.id)} pregunta={`¿Eliminar ${a.ruta}? Solo se puede si está vacía.`}>
                      Eliminar
                    </BotonAccion>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
        {editable && (
          <Card className="mt-4">
            <h3 className="mb-3 font-bold">Agregar torre, sector, piso o nivel</h3>
            <AgrupacionForm accion={crearAgrupacion.bind(null, id)} agrupaciones={op.opcionesAgrupacion} />
          </Card>
        )}
      </section>

      {/* ── Estacionamientos y bodegas ── */}
      <section aria-labelledby="espacios" className="mb-10">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="espacios" className="mb-1 scroll-mt-24 text-xl font-bold">
              Estacionamientos y bodegas
            </h2>
            <p className="text-sm text-texto-suave">
              La condición dice de quién es; el uso, quién lo ocupa. Un estacionamiento de visitas o común no pertenece a ninguna unidad.
            </p>
          </div>
          {editable && (
            <BotonLink href={`${base}/espacios/nuevo`}>
              <Plus size={16} aria-hidden="true" /> Agregar estacionamiento o bodega
            </BotonLink>
          )}
        </div>
        {espacios.length > 0 && (
          <nav aria-label="Filtrar" className="mb-3 flex flex-wrap gap-2">
            {Object.entries(FILTROS).map(([k, v]) => (
              <Link
                key={k}
                href={k === "todos" ? `${base}#espacios` : `${base}?filtro=${k}#espacios`}
                aria-current={filtro === k ? "page" : undefined}
                className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
                  filtro === k ? "border-marca bg-marca text-white" : "border-borde bg-white text-convive-oscuro hover:border-convive"
                }`}
              >
                {v.texto} ({espacios.filter((e) => v.cumple(e)).length})
              </Link>
            ))}
          </nav>
        )}
        {espacios.length === 0 ? (
          <Vacio>Aún no hay estacionamientos ni bodegas registrados.</Vacio>
        ) : visibles.length === 0 ? (
          <Vacio>Ninguno cumple este filtro.</Vacio>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <th>Código</th>
                <th>Ubicación</th>
                <th>Condición</th>
                <th>Propiedad</th>
                <th>Destino</th>
                <th>Uso actual</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((e) => {
                const actual = asignacionVigente(e.asignaciones);
                // Se calcula hoy: una asignación temporal vencida deja el espacio disponible.
                const sit = situacionEspacio(e, actual);
                return (
                  <tr key={e.id}>
                    <td>
                      <Link href={`${base}/espacios/${e.id}`} className="font-semibold whitespace-nowrap text-marca hover:underline">
                        {CLASES[e.clase].singular} {e.codigo}
                      </Link>
                      {e.accesible && <span className="block text-xs text-texto-suave">Accesible</span>}
                    </td>
                    <td>{[rutaAgrupacion(e.agrupacionId, op.agrupaciones), e.ubicacion].filter(Boolean).join(" · ") || "—"}</td>
                    <td>{REGIMENES[e.regimen].texto}</td>
                    <td>{propiedadDe(e)}</td>
                    <td>{e.destino ? DESTINOS[e.destino].split(" (")[0] : "Sin indicar"}</td>
                    <td>{sit.quien ?? "—"}</td>
                    <td>
                      <Insignia tono={sit.tono}>{sit.texto}</Insignia>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Tabla>
        )}
      </section>

      {/* ── Instalaciones ── */}
      <section aria-labelledby="instalaciones" className="mb-20 md:mb-0">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="instalaciones" className="mb-1 scroll-mt-24 text-xl font-bold">
              Instalaciones
            </h2>
            <p className="text-sm text-texto-suave">Inventario básico: ascensores, bombas, portones, cámaras, espacios comunes y equipamiento.</p>
          </div>
          {editable && (
            <BotonLink href={`${base}/instalaciones/nueva`}>
              <Plus size={16} aria-hidden="true" /> Agregar instalación
            </BotonLink>
          )}
        </div>
        {instalaciones.length === 0 ? (
          <Vacio>Aún no hay instalaciones registradas.</Vacio>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <th>Código</th>
                <th>Nombre</th>
                <th>Tipo</th>
                <th>Ubicación</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {instalaciones.map((i) => (
                <tr key={i.id}>
                  <td>
                    <Link href={`${base}/instalaciones/${i.id}`} className="font-semibold text-marca hover:underline">
                      {i.codigo}
                    </Link>
                  </td>
                  <td>{i.nombre}</td>
                  <td>{TIPOS_INSTALACION[i.tipo].split(" (")[0]}</td>
                  <td>{[rutaAgrupacion(i.agrupacionId, op.agrupaciones), i.ubicacion].filter(Boolean).join(" · ") || "—"}</td>
                  <td>
                    <Insignia tono={TONO_INSTALACION[i.estado]}>{ESTADOS_INSTALACION[i.estado]}</Insignia>
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </section>
    </>
  );
}
