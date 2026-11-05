import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdministradora, puedeEditar, puedeVerPropiedad } from "@/lib/auth";
import { db } from "@/lib/db";
import { FileSpreadsheet, Plus, Send } from "lucide-react";
import { BotonLink, Card, PageHeader, Vacio } from "@/components/ui";
import { morosidad } from "@/lib/cobro-servicio";
import { ETIQUETAS_TIPO_UNIDAD, formatoPorcentaje } from "@/lib/formato";
import { UnidadForm } from "../../unidad-form";
import { crearUnidad } from "../../actions";
import { ListaUnidades } from "./lista-unidades";
import { COLOR_ALICUOTAS, estadoAlicuotas } from "@/lib/alicuotas";

export default async function UnidadesPage({ params }: PageProps<"/condominios/[id]/unidades">) {
  const { id } = await params;
  const { usuario, administradoraId } = await requireAdministradora(["ADMINISTRADOR", "COMITE"]);
  if (!puedeVerPropiedad(usuario, id)) notFound();

  const condominio = await db.condominio.findFirst({
    where: { id, administradoraId },
    include: {
      unidades: {
        orderBy: { numero: "asc" },
        include: { personas: { include: { persona: { select: { nombre: true } } } } },
      },
    },
  });
  if (!condominio) notFound();
  const conDeuda = new Set((await morosidad(id, administradoraId)).map((m) => m.unidadId));

  const editable = puedeEditar(usuario.rol);
  const sumaAlicuotas = condominio.unidades.reduce((s, u) => s + Number(u.alicuota), 0);
  const estado = estadoAlicuotas({ cargadas: condominio.unidades.length, suma: sumaAlicuotas, total: condominio.totalUnidades });

  return (
    <>
      <PageHeader
        titulo="Residentes y unidades"
        descripcion={condominio.nombre}
        acciones={
          editable && (
            <>
              <BotonLink href={`/condominios/${id}/importar`} variante="secundario">
                <FileSpreadsheet size={16} aria-hidden="true" /> Cargar desde Excel
              </BotonLink>
              <BotonLink href={`/condominios/${id}/invitaciones`} variante="secundario">
                <Send size={16} aria-hidden="true" /> Invitar residentes
              </BotonLink>
            </>
          )
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <Card>
          <p className="text-sm text-texto-suave">Unidades</p>
          <p className="mt-1 text-2xl font-bold">
            {condominio.unidades.length}
            {condominio.totalUnidades && <span className="text-base font-semibold text-texto-suave"> de {condominio.totalUnidades}</span>}
          </p>
          {condominio.totalUnidades && condominio.unidades.length < condominio.totalUnidades && (
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100"
              role="progressbar"
              aria-label="Unidades cargadas"
              aria-valuenow={condominio.unidades.length}
              aria-valuemax={condominio.totalUnidades}
            >
              <div className="h-full bg-marca" style={{ width: `${(condominio.unidades.length / condominio.totalUnidades) * 100}%` }} />
            </div>
          )}
        </Card>
        <Card>
          <p className="text-sm text-texto-suave">Suma de alícuotas</p>
          <p className={`mt-1 text-2xl font-bold ${estado.tipo === "error" ? "text-peligro" : ""}`}>
            {formatoPorcentaje(sumaAlicuotas)}
          </p>
          {estado.tipo === "progreso" && <p className="mt-1 text-xs text-texto-suave">Llegará a 100 % con todas las unidades.</p>}
        </Card>
        <Card>
          <p className="text-sm text-texto-suave">Fondo de reserva</p>
          <p className="mt-1 text-2xl font-bold">{formatoPorcentaje(condominio.porcentajeReserva, 2)}</p>
        </Card>
        <Card>
          <p className="text-sm text-texto-suave">Vence el día</p>
          <p className="mt-1 text-2xl font-bold">{condominio.diaVencimiento}</p>
        </Card>
      </div>

      {condominio.unidades.length > 0 && estado.tipo !== "ok" && (
        <p className={`mb-6 rounded-xl px-3 py-2 text-sm ${COLOR_ALICUOTAS[estado.tipo]}`}>
          {estado.texto}
          {editable && (estado.tipo === "revisar" || estado.tipo === "error") && (
            <>
              {" "}
              <Link href={`/condominios/${id}/editar`} className="font-semibold underline">
                Configurar propiedad
              </Link>
            </>
          )}
        </p>
      )}

      {condominio.unidades.length === 0 ? (
        <Vacio>
          Esta propiedad aún no tiene unidades.
          {editable && (
            <>
              {" "}
              Agrégalas una por una abajo o{" "}
              <Link href={`/condominios/${id}/importar`} className="font-semibold text-marca hover:underline">
                cárgalas todas desde Excel
              </Link>
              .
            </>
          )}
        </Vacio>
      ) : (
        <ListaUnidades
          base={`/condominios/${id}/unidades`}
          editable={editable}
          unidades={condominio.unidades.map((u) => {
            const nombres = (rel: string) =>
              u.personas
                .filter((p) => p.relacion === rel)
                .map((p) => p.persona.nombre)
                .join(", ");
            return {
              id: u.id,
              numero: u.numero,
              tipo: ETIQUETAS_TIPO_UNIDAD[u.tipo],
              alicuota: formatoPorcentaje(u.alicuota),
              propietarios: nombres("PROPIETARIO"),
              residentes: nombres("RESIDENTE"),
              deudaVencida: conDeuda.has(u.id),
            };
          })}
        />
      )}

      {editable && (
        <>
          <Card className="mt-8 mb-20 md:mb-0">
            <h2 id="agregar-unidad" className="mb-4 scroll-mt-24 text-lg font-bold">
              Agregar unidad
            </h2>
            <UnidadForm accion={crearUnidad.bind(null, id)} textoBoton="Agregar" limpiarAlGuardar />
          </Card>
          <a
            href="#agregar-unidad"
            className="fixed right-4 bottom-6 z-20 inline-flex min-h-14 items-center gap-2 rounded-full bg-marca px-5 font-bold text-white shadow-lg hover:bg-marca-oscuro md:hidden"
          >
            <Plus size={20} aria-hidden="true" /> Agregar unidad
          </a>
        </>
      )}
    </>
  );
}
