import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, CircleAlert, CircleDashed, Clock, Info, Lock } from "lucide-react";
import { BotonLink, Card, Insignia, Mensaje } from "@/components/ui";
import { esPrincipal } from "@/lib/permisos";
import {
  avanceConfiguracion,
  ESTADOS,
  MODALIDADES,
  ORDEN_ESTADOS,
  pasosConfiguracion,
  revisarCambio,
  TIPOS,
  TONO_ESTADO,
  type EstadoPaso,
} from "@/lib/configuracion";
import { datosDeUna } from "@/lib/configuracion-servicio";
import { formatoDia } from "@/lib/formato";
import { cambiarEstadoComunidad } from "../../actions";
import { condominioVisible } from "../condominio-actual";
import { CambiarEstado } from "./cambiar-estado";

const ICONOS: Record<EstadoPaso, { icono: typeof Check; clase: string; texto: string }> = {
  completo: { icono: Check, clase: "bg-exito-suave text-exito", texto: "Completo" },
  observacion: { icono: CircleAlert, clase: "bg-alerta-suave text-alerta", texto: "Con observaciones" },
  pendiente: { icono: CircleDashed, clase: "bg-gray-100 text-texto-suave", texto: "Pendiente" },
  disponible: { icono: Info, clase: "bg-marca-suave text-marca", texto: "Revisar" },
  proximamente: { icono: Clock, clase: "bg-gray-100 text-texto-suave", texto: "Próxima entrega" },
};

export default async function ConfiguracionPage({ params, searchParams }: PageProps<"/condominios/[id]/configuracion">) {
  const { id } = await params;
  const { creada, guardado, cambiado } = await searchParams;
  const { usuario, condominio, editable, administradoraId } = await condominioVisible(id);
  const datos = await datosDeUna(administradoraId, id);
  if (!datos) notFound();
  const base = `/condominios/${id}`;
  const pasos = pasosConfiguracion(datos);
  const avance = avanceConfiguracion(datos);
  const principal = esPrincipal(usuario);
  const posicion = ORDEN_ESTADOS.indexOf(datos.estado);
  const siguiente = ORDEN_ESTADOS[posicion + 1];
  const anterior = posicion > 0 ? ORDEN_ESTADOS[posicion - 1] : undefined;
  const revisionSiguiente = siguiente ? revisarCambio(datos, siguiente) : null;
  const revisionAnterior = anterior ? revisarCambio(datos, anterior) : null;
  const necesitaPrincipal = (destino: string) =>
    !principal && (destino === "HABILITADA_FINANCIERA" || datos.estado === "HABILITADA_FINANCIERA");
  const accion = cambiarEstadoComunidad.bind(null, id);

  return (
    <>
      <nav aria-label="Ruta" className="mb-2 text-sm text-texto-suave">
        <Link href="/condominios" className="hover:text-marca">
          Mis propiedades
        </Link>
        <span aria-hidden="true"> › </span>
        <Link href={base} className="hover:text-marca">
          {condominio.nombre}
        </Link>
        <span aria-hidden="true"> › </span>
        <span>Configuración</span>
      </nav>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-convive-oscuro md:text-[2rem]">Configuración</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-texto-suave">
            {condominio.nombre}
            <Insignia tono={TONO_ESTADO[datos.estado]}>{ESTADOS[datos.estado].texto}</Insignia>
          </p>
        </div>
        <BotonLink href={base} variante="secundario">
          Ir al panel de la propiedad
        </BotonLink>
      </div>

      {creada && (
        <div className="mb-4">
          <Mensaje tipo="ok" texto="Propiedad guardada. Quedó en configuración: sigue con los pasos cuando quieras." />
        </div>
      )}
      {cambiado && (
        <div className="mb-4">
          <Mensaje tipo="ok" texto={`Listo: ahora está ${ESTADOS[datos.estado].texto.toLowerCase()}.`} />
        </div>
      )}
      {guardado && (
        <div className="mb-4">
          <Mensaje tipo="ok" texto="Cambios guardados." />
        </div>
      )}

      <Card className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold">{ESTADOS[datos.estado].descripcion}</p>
            <p className="mt-1 text-sm text-texto-suave">
              {[
                datos.tipo && TIPOS[datos.tipo],
                datos.modalidad && MODALIDADES[datos.modalidad].texto,
                datos.fechaIncorporacion && `Incorporada el ${formatoDia(datos.fechaIncorporacion)}`,
                `${datos.unidades}${datos.totalUnidades ? ` de ${datos.totalUnidades}` : ""} ${datos.unidades === 1 && !datos.totalUnidades ? "unidad" : "unidades"}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <p className="text-sm font-semibold tabular-nums">
            {avance.completos} de {avance.total} pasos principales completos
          </p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-marca-suave" aria-hidden="true">
          <div className="h-full rounded-full bg-marca" style={{ width: `${avance.porcentaje}%` }} />
        </div>
      </Card>

      <ol className="mb-8 grid gap-3">
        {pasos
          .filter((p) => p.numero !== "08")
          .map((p) => {
            const i = ICONOS[p.estado];
            return (
              <li key={p.numero} className="sombra-convive flex flex-wrap items-center gap-4 rounded-2xl border border-borde bg-white p-4">
                <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${i.clase}`}>
                  <i.icono size={20} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 basis-60">
                  <span className="block font-bold">
                    {p.numero}. {p.titulo} <span className="ml-1 text-xs font-semibold text-texto-suave">· {i.texto}</span>
                  </span>
                  <span className="block text-sm text-texto-suave">{p.detalle}</span>
                </span>
                {p.ruta && p.accion && editable && (
                  <BotonLink
                    href={`${base}${p.ruta}${p.ruta === "/editar" ? "?volver=configuracion" : ""}`}
                    variante={p.estado === "completo" ? "secundario" : "primario"}
                  >
                    {p.accion}
                  </BotonLink>
                )}
              </li>
            );
          })}
      </ol>

      <section aria-labelledby="activacion">
        <h2 id="activacion" className="mb-3 text-xl font-bold text-convive-oscuro">
          08. Validación y activación
        </h2>
        <ol className="mb-4 grid gap-2 sm:grid-cols-3">
          {ORDEN_ESTADOS.map((e, n) => (
            <li
              key={e}
              className={`rounded-xl border p-3 text-sm ${
                n === posicion ? "border-marca bg-marca-suave font-semibold" : n < posicion ? "border-borde bg-white" : "border-dashed border-borde bg-white/60 text-texto-suave"
              }`}
            >
              <span className="block">
                {n + 1}. {ESTADOS[e].texto}
              </span>
              {n < posicion && <span className="text-xs text-exito">Cumplido</span>}
              {n === posicion && <span className="text-xs">Estado actual</span>}
            </li>
          ))}
        </ol>

        {editable && siguiente && revisionSiguiente && (
          <Card className="mb-4">
            <p className="font-semibold">Siguiente paso: {ESTADOS[siguiente].texto.toLowerCase()}</p>
            <p className="mb-3 text-sm text-texto-suave">{ESTADOS[siguiente].descripcion}</p>
            {revisionSiguiente.bloqueos.length > 0 && (
              <ul className="mb-3 space-y-1 text-sm">
                {revisionSiguiente.bloqueos.map((b) => (
                  <li key={b} className="flex gap-2 text-peligro">
                    <Lock size={15} className="mt-0.5 shrink-0" aria-hidden="true" /> {b}
                  </li>
                ))}
              </ul>
            )}
            {revisionSiguiente.advertencias.length > 0 && (
              <ul className="mb-3 space-y-1 text-sm">
                {revisionSiguiente.advertencias.map((a) => (
                  <li key={a} className="flex gap-2 text-alerta">
                    <CircleAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" /> {a} Puedes continuar; quedará anotado.
                  </li>
                ))}
              </ul>
            )}
            {revisionSiguiente.ok && necesitaPrincipal(siguiente) && (
              <p className="text-sm text-texto-suave">Solo el administrador principal puede habilitar los cobros.</p>
            )}
            {revisionSiguiente.ok && !necesitaPrincipal(siguiente) && (
              <CambiarEstado
                accion={accion}
                destino={siguiente}
                texto={siguiente === "HABILITADA_FINANCIERA" ? "Habilitar cobros" : "Habilitar administrativamente"}
                pregunta={`¿Pasar ${condominio.nombre} a "${ESTADOS[siguiente].texto}"?${
                  revisionSiguiente.advertencias.length ? ` Advertencias: ${revisionSiguiente.advertencias.join(" ")}` : ""
                }`}
              />
            )}
          </Card>
        )}

        {editable && anterior && revisionAnterior && !necesitaPrincipal(anterior) && (
          <div className="text-sm">
            {revisionAnterior.ok ? (
              <CambiarEstado
                accion={accion}
                destino={anterior}
                variante="secundario"
                texto={`Volver a "${ESTADOS[anterior].texto}"`}
                pregunta={`¿Volver ${condominio.nombre} a "${ESTADOS[anterior].texto}"? No se borra ningún dato.`}
              />
            ) : (
              <p className="text-texto-suave">{revisionAnterior.bloqueos.join(" ")}</p>
            )}
          </div>
        )}
      </section>
    </>
  );
}
