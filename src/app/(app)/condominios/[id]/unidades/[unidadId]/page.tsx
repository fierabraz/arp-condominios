import Link from "next/link";
import { notFound } from "next/navigation";
import { puedeEditar, puedeVerPropiedad, requireAdministradora } from "@/lib/auth";
import { filtroPersonas } from "@/lib/permisos";
import { db } from "@/lib/db";
import { Boton, Card, PageHeader, Tabla, Vacio } from "@/components/ui";
import { UnidadForm } from "../../../unidad-form";
import { cambiarDiaPago, editarUnidad, eliminarUnidad, terminarVinculoPersona, vincularPersona } from "../../../actions";
import { DiaPagoForm } from "./dia-pago-form";
import { TerminarAsignacionForm } from "../../estructura/formularios";
import { ORDEN_TIPOS, relacionDe, TIPOS_VINCULO } from "@/lib/vinculos";
import { diaISO } from "@/lib/forms";
import { formatoDia } from "@/lib/formato";
import { VinculoForm } from "./vinculo-form";
import { estadoCuenta } from "@/lib/cobro-servicio";
import { EstadoCuenta } from "@/components/estado-cuenta";
import { historialUnidad } from "@/lib/unidades";
import { asignacionVigente, CLASES, hoyDia, opcionesAgrupaciones } from "@/lib/estructura";

export default async function UnidadPage({ params }: PageProps<"/condominios/[id]/unidades/[unidadId]">) {
  const { id, unidadId } = await params;
  const { usuario, administradoraId } = await requireAdministradora();
  if (!puedeVerPropiedad(usuario, id)) notFound();

  const [unidad, personas] = await Promise.all([
    db.unidad.findFirst({
      where: { id: unidadId, condominioId: id, administradoraId },
      include: {
        condominio: { select: { nombre: true, diaVencimiento: true } },
        vinculos: { include: { persona: { select: { nombre: true } } }, orderBy: [{ hasta: { sort: "desc", nulls: "first" } }, { creadoEn: "asc" }] },
      },
    }),
    db.persona.findMany({
      where: { administradoraId, ...filtroPersonas(usuario) },
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true },
    }),
  ]);
  if (!unidad) notFound();
  const vigentes = unidad.vinculos.filter((v) => !v.hasta).sort((a, b) => ORDEN_TIPOS.indexOf(a.tipo) - ORDEN_TIPOS.indexOf(b.tipo));
  const terminados = unidad.vinculos.filter((v) => v.hasta);
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

      <Card className="mb-6">
        <h2 className="mb-1 font-medium">Día de pago de gastos comunes</h2>
        <p className="mb-4 text-sm text-texto-suave">
          {unidad.diaPago === null
            ? `Esta unidad paga el día ${unidad.condominio.diaVencimiento}, igual que la propiedad.`
            : `Esta unidad paga el día ${unidad.diaPago} de cada mes (la propiedad usa el día ${unidad.condominio.diaVencimiento}).`}{" "}
          Si alguien no puede pagar en la fecha general, elige otro día: el cobro vencerá ese día y la mora y el interés se
          contarán desde ahí. Se aplica a los cobros que emitas desde ahora.
        </p>
        <DiaPagoForm
          accion={cambiarDiaPago.bind(null, unidad.id)}
          diaPago={unidad.diaPago}
          diaPropiedad={unidad.condominio.diaVencimiento}
          editable={puedeEditar(usuario)}
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
        <h2 className="mb-1 font-medium">Personas de la unidad</h2>
        <p className="mb-4 text-sm text-texto-suave">
          Propietarios, copropietarios, arrendatarios, residentes y ocupantes, con sus fechas. Un vínculo que termina no se borra:
          pasa al historial.
        </p>
        {vigentes.length === 0 ? (
          <Vacio>Nadie vinculado todavía.</Vacio>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <th>Persona</th>
                <th>Vínculo</th>
                <th>Desde</th>
                <th>Terminar</th>
              </tr>
            </thead>
            <tbody>
              {vigentes.map((v) => (
                <tr key={v.id}>
                  <td>
                    <Link href={`/personas/${v.personaId}`} className="font-semibold text-marca hover:underline">
                      {v.persona.nombre}
                    </Link>
                    {v.respaldo && <span className="block text-xs text-texto-suave">Respaldo: {v.respaldo}</span>}
                  </td>
                  <td>
                    {TIPOS_VINCULO[v.tipo].texto}
                    {v.terminoPrevisto && <span className="block text-xs text-texto-suave">Término previsto: {formatoDia(v.terminoPrevisto)}</span>}
                    {!relacionDe(v.tipo) && <span className="block text-xs text-texto-suave">Sin acceso a la app</span>}
                  </td>
                  <td>{v.desde ? formatoDia(v.desde) : "Sin fecha registrada"}</td>
                  <td>
                    <TerminarAsignacionForm accion={terminarVinculoPersona.bind(null, unidad.id, v.id)} hoy={diaISO(hoyDia())} />
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
        <div className="mt-5 border-t border-borde pt-4">
          <h3 className="mb-3 font-bold">Agregar vínculo</h3>
          {personas.length === 0 ? (
            <p className="text-sm text-texto-suave">
              Primero registra personas en{" "}
              <Link href="/personas" className="text-marca hover:underline">
                Personas
              </Link>
              .
            </p>
          ) : (
            <VinculoForm accion={vincularPersona.bind(null, unidad.id)} personas={personas} hoy={diaISO(hoyDia())} />
          )}
        </div>
        {terminados.length > 0 && (
          <div className="mt-5 border-t border-borde pt-4">
            <h3 className="mb-2 font-bold">Historial</h3>
            <ul className="grid gap-1 text-sm">
              {terminados.map((v) => (
                <li key={v.id}>
                  <span className="font-semibold">{v.persona.nombre}</span>, {TIPOS_VINCULO[v.tipo].texto.toLowerCase()}:{" "}
                  {v.desde ? formatoDia(v.desde) : "sin fecha"} → {formatoDia(v.hasta!)}
                  <span className="text-texto-suave"> · terminó {v.terminadoPor}</span>
                </li>
              ))}
            </ul>
          </div>
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
            historial.vinculos && `${historial.vinculos} ${historial.vinculos === 1 ? "vínculo terminado" : "vínculos terminados"}`,
            historial.apertura && `${historial.apertura} ${historial.apertura === 1 ? "saldo de apertura" : "saldos de apertura"}`,
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
