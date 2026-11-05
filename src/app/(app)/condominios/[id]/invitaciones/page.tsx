import Link from "next/link";
import { notFound } from "next/navigation";
import { Info } from "lucide-react";
import { BotonInvitar, InvitarTodos } from "@/components/invitacion";
import { BotonLink, Card, Insignia, PageHeader, Vacio } from "@/components/ui";
import { correoConfigurado } from "@/lib/correo";
import { ETIQUETAS_ACCESO, estadoAcceso, puedeInvitar } from "@/lib/invitacion-estado";
import { personasDePropiedad } from "@/lib/invitaciones";
import { DIAS_INVITACION } from "@/lib/recuperacion";
import { condominioVisible } from "../condominio-actual";
import { invitar, invitarPendientes } from "../../invitaciones-actions";

export default async function InvitacionesPage({ params }: PageProps<"/condominios/[id]/invitaciones">) {
  const { id } = await params;
  const { condominio, administradoraId, editable } = await condominioVisible(id);
  if (!editable) notFound();

  const personas = (await personasDePropiedad(id, administradoraId)).map((p) => ({
    ...p,
    estado: estadoAcceso(p.correo, p.usuario && { ...p.usuario, invitaciones: p.usuario.tokensRecuperacion }),
  }));
  const pendientes = personas.filter((p) => puedeInvitar(p.estado) && p.estado !== "INVITADA").length;
  const cuenta = (e: string) => personas.filter((p) => p.estado === e).length;
  const conCorreo = correoConfigurado();

  return (
    <>
      <PageHeader
        titulo="Invitar residentes"
        descripcion={`${condominio.nombre} · Cada persona recibe un enlace para crear su contraseña y entrar a la app.`}
        acciones={
          <BotonLink href={`/condominios/${id}/importar`} variante="secundario">
            Cargar desde Excel
          </BotonLink>
        }
      />

      {!conCorreo && (
        <div className="mb-6 flex gap-3 rounded-2xl border border-alerta-suave bg-alerta-suave p-4 text-sm text-alerta">
          <Info size={20} className="shrink-0" aria-hidden="true" />
          <p>
            El envío de correos todavía no está configurado, así que las invitaciones no llegan por correo. Al invitar a
            alguien verás su enlace con un botón para mandárselo por WhatsApp o copiarlo.
          </p>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <Card>
          <p className="text-sm text-texto-suave">Con acceso</p>
          <p className="mt-1 text-2xl font-bold">{cuenta("ACTIVA")}</p>
        </Card>
        <Card>
          <p className="text-sm text-texto-suave">Invitados, sin entrar aún</p>
          <p className="mt-1 text-2xl font-bold">{cuenta("INVITADA")}</p>
        </Card>
        <Card>
          <p className="text-sm text-texto-suave">Por invitar</p>
          <p className="mt-1 text-2xl font-bold">{pendientes}</p>
        </Card>
        <Card>
          <p className="text-sm text-texto-suave">Sin correo</p>
          <p className={`mt-1 text-2xl font-bold ${cuenta("SIN_CORREO") ? "text-alerta" : ""}`}>{cuenta("SIN_CORREO")}</p>
        </Card>
      </div>

      {personas.length === 0 ? (
        <Vacio>
          Esta propiedad aún no tiene propietarios ni residentes vinculados. Cárgalos desde{" "}
          <Link href={`/condominios/${id}/importar`} className="font-semibold text-marca hover:underline">
            Excel
          </Link>{" "}
          o desde cada unidad.
        </Vacio>
      ) : (
        <>
          <Card className="mb-6">
            <h2 className="font-bold">Invitar a todos de una vez</h2>
            <p className="mt-1 mb-4 text-sm text-texto-suave">
              Crea la invitación de cada persona con correo que todavía no tiene acceso. Los enlaces sirven una sola vez y
              durante {DIAS_INVITACION} días.
            </p>
            {pendientes > 0 ? (
              <InvitarTodos invitar={invitarPendientes.bind(null, id)} cantidad={pendientes} />
            ) : (
              <p className="text-sm font-semibold text-exito">No queda nadie con correo por invitar.</p>
            )}
          </Card>

          <ul className="divide-y divide-gray-100 sombra-convive rounded-2xl border border-borde bg-white">
            {personas.map((p) => {
              const etiqueta = ETIQUETAS_ACCESO[p.estado];
              const unidades = [...new Set(p.unidades.map((v) => v.unidad.numero))].join(", ");
              return (
                <li key={p.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <Link href={`/personas/${p.id}`} className="font-semibold text-marca hover:underline">
                        {p.nombre}
                      </Link>
                      <Insignia tono={etiqueta.tono}>{etiqueta.texto}</Insignia>
                    </p>
                    <p className="mt-1 text-sm text-texto-suave">
                      Unidad {unidades}
                      {p.correo ? ` · ${p.correo}` : ""}
                      {p.telefono ? ` · ${p.telefono}` : ""}
                    </p>
                    {p.estado === "SIN_CORREO" && (
                      <p className="mt-1 text-sm text-alerta">
                        Para invitarla,{" "}
                        <Link href={`/personas/${p.id}`} className="font-semibold underline">
                          agrega su correo
                        </Link>
                        .
                      </p>
                    )}
                  </div>
                  {puedeInvitar(p.estado) && (
                    <div className="md:w-96 md:shrink-0">
                      <BotonInvitar invitar={invitar.bind(null, p.id, id)} reenviar={p.estado !== "SIN_CUENTA"} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
