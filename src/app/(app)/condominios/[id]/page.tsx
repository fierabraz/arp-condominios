import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdministradora, puedeEditar } from "@/lib/auth";
import { db } from "@/lib/db";
import { BotonLink, Card, PageHeader, Tabla, Vacio } from "@/components/ui";
import { ETIQUETAS_TIPO_UNIDAD, formatoPorcentaje } from "@/lib/formato";
import { UnidadForm } from "../unidad-form";
import { crearUnidad } from "../actions";
import { NavCondominio } from "./nav-condominio";

export default async function CondominioPage({ params }: PageProps<"/condominios/[id]">) {
  const { id } = await params;
  const { usuario, administradoraId } = await requireAdministradora(["ADMINISTRADOR", "COMITE"]);
  if (usuario.rol === "COMITE" && usuario.condominioId !== id) notFound();

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

  const editable = puedeEditar(usuario.rol);
  const sumaAlicuotas = condominio.unidades.reduce((s, u) => s + Number(u.alicuota), 0);
  const cuadra = Math.abs(sumaAlicuotas - 100) < 0.0001;

  return (
    <>
      <PageHeader
        titulo={condominio.nombre}
        descripcion={`${condominio.direccion}${condominio.comuna ? `, ${condominio.comuna}` : ""}`}
        acciones={
          editable && (
            <BotonLink variante="secundario" href={`/condominios/${id}/editar`}>
              Editar datos
            </BotonLink>
          )
        }
      />

      <NavCondominio id={id} actual="" />

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Card>
          <p className="text-sm text-gray-600">Unidades</p>
          <p className="mt-1 text-2xl font-semibold">{condominio.unidades.length}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-600">Suma de alícuotas</p>
          <p className={`mt-1 text-2xl font-semibold ${cuadra ? "" : "text-amber-600"}`}>
            {formatoPorcentaje(sumaAlicuotas)}
          </p>
          {!cuadra && condominio.unidades.length > 0 && (
            <p className="mt-1 text-xs text-amber-700">Debería sumar 100 % para cobrar correctamente.</p>
          )}
        </Card>
        <Card>
          <p className="text-sm text-gray-600">Fondo de reserva</p>
          <p className="mt-1 text-2xl font-semibold">{formatoPorcentaje(condominio.porcentajeReserva, 2)}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-600">Vence el día</p>
          <p className="mt-1 text-2xl font-semibold">{condominio.diaVencimiento}</p>
        </Card>
      </div>

      {editable && (
        <Card className="mb-6">
          <h2 className="mb-4 font-medium">Agregar unidad</h2>
          <UnidadForm accion={crearUnidad.bind(null, id)} textoBoton="Agregar" limpiarAlGuardar />
        </Card>
      )}

      {condominio.unidades.length === 0 ? (
        <Vacio>Este condominio aún no tiene unidades.</Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th>Unidad</th>
              <th>Tipo</th>
              <th className="text-right">Alícuota</th>
              <th>Propietario</th>
              <th>Residente</th>
            </tr>
          </thead>
          <tbody>
            {condominio.unidades.map((u) => {
              const nombres = (rel: string) =>
                u.personas.filter((p) => p.relacion === rel).map((p) => p.persona.nombre).join(", ") || "—";
              return (
                <tr key={u.id}>
                  <td>
                    {editable ? (
                      <Link
                        href={`/condominios/${id}/unidades/${u.id}`}
                        className="font-medium text-blue-700 hover:underline"
                      >
                        {u.numero}
                      </Link>
                    ) : (
                      <span className="font-medium">{u.numero}</span>
                    )}
                  </td>
                  <td>{ETIQUETAS_TIPO_UNIDAD[u.tipo]}</td>
                  <td className="text-right tabular-nums">{formatoPorcentaje(u.alicuota)}</td>
                  <td>{nombres("PROPIETARIO")}</td>
                  <td>{nombres("RESIDENTE")}</td>
                </tr>
              );
            })}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
