import { notFound } from "next/navigation";
import { requireAdministradora } from "@/lib/auth";
import { filtroPersonas, filtroPorCondominio } from "@/lib/permisos";
import { TIPOS_VINCULO } from "@/lib/vinculos";
import { formatoDia } from "@/lib/formato";
import Link from "next/link";
import { db } from "@/lib/db";
import { Boton, Card, Insignia, PageHeader } from "@/components/ui";
import { BotonInvitar } from "@/components/invitacion";
import { ETIQUETAS_ACCESO, puedeInvitar } from "@/lib/invitacion-estado";
import { estadoDePersona } from "@/lib/invitaciones";
import { DIAS_INVITACION } from "@/lib/recuperacion";
import { invitar } from "../../condominios/invitaciones-actions";
import { PersonaForm } from "../persona-form";
import { editarPersona, eliminarPersona } from "../actions";
import { motivosParaNoEliminar } from "@/lib/personas";

export default async function PersonaPage({ params }: PageProps<"/personas/[id]">) {
  const { id } = await params;
  const { usuario, administradoraId } = await requireAdministradora();
  const p = await db.persona.findFirst({ where: { id, administradoraId, ...filtroPersonas(usuario) }, include: {
      _count: { select: { unidades: true, vinculos: true } },
      usuario: { select: { id: true } },
      vinculos: {
        where: { unidad: filtroPorCondominio(usuario) },
        include: { unidad: { select: { id: true, numero: true, condominioId: true, condominio: { select: { nombre: true } } } } },
        orderBy: [{ hasta: { sort: "desc", nulls: "first" } }, { creadoEn: "desc" }],
      },
    },
  });
  if (!p) notFound();
  const estado = (await estadoDePersona(p.id, administradoraId))!;
  const sinUnidad = p._count.unidades === 0;
  // SEG-20: cuenta todos sus vínculos, también los de propiedades que esta cuenta no ve.
  const motivos = motivosParaNoEliminar({ unidades: p._count.unidades, vinculos: p._count.vinculos, tieneCuenta: !!p.usuario });

  return (
    <>
      <PageHeader titulo={p.nombre} />
      <Card className="mb-6">
        <PersonaForm accion={editarPersona.bind(null, p.id)} textoBoton="Guardar cambios" valores={p} />
      </Card>
      <Card className="mb-6">
        <h2 className="mb-1 flex flex-wrap items-center gap-2 font-medium">
          Acceso a la app <Insignia tono={ETIQUETAS_ACCESO[estado].tono}>{ETIQUETAS_ACCESO[estado].texto}</Insignia>
        </h2>
        <p className="mb-4 text-sm text-texto-suave">
          {estado === "SIN_CORREO"
            ? "Agrega su correo arriba para poder invitarla a la app."
            : estado === "ACTIVA"
              ? "Ya creó su contraseña. Si la olvida, puede recuperarla desde el ingreso de residentes."
              : estado === "DESACTIVADA"
                ? "Su cuenta está desactivada."
                : sinUnidad
                  ? "Vincúlala primero a una unidad: sin unidad no vería nada en la app."
                  : `Recibe un enlace para crear su contraseña (sirve una vez y durante ${DIAS_INVITACION} días).`}
        </p>
        {puedeInvitar(estado) && !sinUnidad && (
          <BotonInvitar invitar={invitar.bind(null, p.id, undefined)} reenviar={estado !== "SIN_CUENTA"} />
        )}
      </Card>
      <Card className="mb-6">
        <h2 className="mb-3 font-medium">Unidades e historial</h2>
        {p.vinculos.length === 0 ? (
          <p className="text-sm text-texto-suave">Sin vínculos con unidades.</p>
        ) : (
          <ul className="grid gap-1 text-sm">
            {p.vinculos.map((v) => (
              <li key={v.id}>
                <Link href={`/condominios/${v.unidad.condominioId}/unidades/${v.unidad.id}`} className="font-semibold text-marca hover:underline">
                  {v.unidad.condominio.nombre} · {v.unidad.numero}
                </Link>{" "}
                {TIPOS_VINCULO[v.tipo].texto.toLowerCase()}, {v.desde ? `desde ${formatoDia(v.desde)}` : "sin fecha de inicio"}
                {v.hasta ? <span className="text-texto-suave"> hasta {formatoDia(v.hasta)} (terminado)</span> : <span className="text-exito"> · vigente</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {motivos.length > 0 ? (
        <div className="text-sm text-texto-suave">
          <p className="font-medium text-texto">Esta persona no se puede eliminar:</p>
          <ul className="mt-1 list-disc pl-5">
            {motivos.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      ) : (
        <form action={eliminarPersona.bind(null, p.id)}>
          <Boton variante="peligro" type="submit">
            Eliminar persona
          </Boton>
        </form>
      )}
    </>
  );
}
