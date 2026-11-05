import Link from "next/link";
import { notFound } from "next/navigation";
import { puedeVerPropiedad, requireAdministradora } from "@/lib/auth";
import { filtroPersonas } from "@/lib/permisos";
import { db } from "@/lib/db";
import { Boton, Card, PageHeader, Vacio } from "@/components/ui";
import { UnidadForm } from "../../../unidad-form";
import { desvincularPersona, editarUnidad, eliminarUnidad, vincularPersona } from "../../../actions";
import { VinculoForm } from "./vinculo-form";
import { estadoCuenta } from "@/lib/cobro-servicio";
import { EstadoCuenta } from "@/components/estado-cuenta";
import { historialUnidad } from "@/lib/unidades";
import { asignacionVigente, CLASES, opcionesAgrupaciones } from "@/lib/estructura";

export default async function UnidadPage({ params }: PageProps<"/condominios/[id]/unidades/[unidadId]">) {
  const { id, unidadId } = await params;
  const { usuario, administradoraId } = await requireAdministradora();
  if (!puedeVerPropiedad(usuario, id)) notFound();

  const [unidad, personas] = await Promise.all([
    db.unidad.findFirst({
      where: { id: unidadId, condominioId: id, administradoraId },
      include: {
        condominio: { select: { nombre: true } },
        personas: { include: { persona: true }, orderBy: { relacion: "asc" } },
      },
    }),
    db.persona.findMany({
      where: { administradoraId, ...filtroPersonas(usuario) },
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true },
    }),
  ]);
  if (!unidad) notFound();
  const [estado, historial, agrupaciones, espacios] = await Promise.all([
    estadoCuenta(unidad.id, administradoraId),
    historialUnidad(unidad.id),
    db.agrupacion.findMany({ where: { condominioId: id } }),
    // Estacionamientos y bodegas de la unidad: los que le pertenecen y los que usa (COM-001).
    db.espacio.findMany({
      where: {
        condominioId: id,
        OR: [{ unidadPrincipalId: unidad.id }, { unidadPropiaId: unidad.id }, { asignaciones: { some: { unidadId: unidad.id } } }],
      },
      include: { asignaciones: { where: { unidadId: unidad.id } } },
      orderBy: [{ clase: "asc" }, { codigo: "asc" }],
    }),
  ]);
  const opcionesAgrupacion = opcionesAgrupaciones(agrupaciones);
  const espaciosUnidad = espacios
    .map((e) => {
      const uso = asignacionVigente(e.asignaciones);
      const relacion =
        e.unidadPrincipalId === unidad.id ? "le pertenece" : e.unidadPropiaId === unidad.id ? "es esta unidad" : uso ? `la usa (${uso.tipo === "TEMPORAL" ? "temporal" : "uso exclusivo"})` : null;
      return relacion ? { id: e.id, nombre: `${CLASES[e.clase].singular} ${e.codigo}`, relacion } : null;
    })
    .filter((x) => x !== null);

  return (
    <>
      <PageHeader
        titulo={`Unidad ${unidad.numero}`}
        descripcion={
          <Link href={`/condominios/${id}/unidades`} className="text-marca hover:underline">
            {unidad.condominio.nombre}
          </Link>
        }
      />

      <section className="mb-8">
        <h2 className="mb-4 font-medium">Estado de cuenta</h2>
        <EstadoCuenta estado={estado!} moneda={usuario.administradora?.moneda ?? "CLP"} />
      </section>

      <Card className="mb-6">
        <h2 className="mb-4 font-medium">Datos de la unidad</h2>
        <UnidadForm
          accion={editarUnidad.bind(null, unidad.id)}
          textoBoton="Guardar"
          agrupaciones={opcionesAgrupacion}
          valores={{
            numero: unidad.numero,
            tipo: unidad.tipo,
            alicuota: unidad.alicuota.toString(),
            agrupacionId: unidad.agrupacionId,
          }}
        />
      </Card>

      {espaciosUnidad.length > 0 && (
        <Card className="mb-6">
          <h2 className="mb-3 font-medium">Estacionamientos y bodegas</h2>
          <ul className="grid gap-1 text-sm">
            {espaciosUnidad.map((e) => (
              <li key={e.id}>
                <Link href={`/condominios/${id}/estructura/espacios/${e.id}`} className="font-semibold text-marca hover:underline">
                  {e.nombre}
                </Link>{" "}
                <span className="text-texto-suave">{e.relacion}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mb-6">
        <h2 className="mb-4 font-medium">Propietarios y residentes</h2>
        {unidad.personas.length === 0 ? (
          <Vacio>Nadie vinculado todavía.</Vacio>
        ) : (
          <ul className="mb-4 divide-y divide-gray-100">
            {unidad.personas.map((v) => (
              <li key={`${v.personaId}-${v.relacion}`} className="flex items-center justify-between py-2 text-sm">
                <span>
                  <span className="font-medium">{v.persona.nombre}</span>
                  <span className="ml-2 text-texto-suave">
                    {v.relacion === "PROPIETARIO" ? "Propietario" : "Residente"}
                  </span>
                </span>
                <form action={desvincularPersona.bind(null, unidad.id, v.personaId, v.relacion)}>
                  <button className="text-sm text-peligro hover:underline">Quitar</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        {personas.length === 0 ? (
          <p className="text-sm text-texto-suave">
            Primero registra personas en{" "}
            <Link href="/personas" className="text-marca hover:underline">
              Personas
            </Link>
            .
          </p>
        ) : (
          <VinculoForm accion={vincularPersona.bind(null, unidad.id)} personas={personas} />
        )}
      </Card>

      {historial.total > 0 ? (
        <p className="rounded-xl bg-fondo px-4 py-3 text-sm text-texto-suave">
          Esta unidad no se puede eliminar porque tiene historia registrada (
          {[
            historial.avisos && `${historial.avisos} ${historial.avisos === 1 ? "cobro" : "cobros"}`,
            historial.pagos && `${historial.pagos} ${historial.pagos === 1 ? "pago" : "pagos"}`,
            historial.gastos && `${historial.gastos} ${historial.gastos === 1 ? "cargo" : "cargos"}`,
            historial.votos && `${historial.votos} ${historial.votos === 1 ? "voto" : "votos"}`,
          ]
            .filter(Boolean)
            .join(", ")}
          ). Borrarla haría desaparecer esa información de las rendiciones y del estado de cuenta.
        </p>
      ) : (
        <form action={eliminarUnidad.bind(null, unidad.id)}>
          <Boton variante="peligro" type="submit">
            Eliminar unidad
          </Boton>
        </form>
      )}
    </>
  );
}
