import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUsuario } from "@/lib/auth";
import { db } from "@/lib/db";
import { Boton, Card, Insignia, PageHeader } from "@/components/ui";
import { ETIQUETAS_ROL, formatoFechaHora } from "@/lib/formato";
import { bloqueoVigente } from "@/lib/intentos";
import { cambiarClaveDe, cambiarEstado, desbloquear, editarDatos } from "../actions";
import { ClaveForm, DatosForm } from "../formularios";

export default async function UsuarioPlataformaPage({ params }: PageProps<"/plataforma/usuarios/[usuarioId]">) {
  const yo = await requireUsuario(["SUPERADMIN"]);
  const { usuarioId } = await params;
  const u = await db.usuario.findUnique({
    where: { id: usuarioId },
    include: { administradora: { select: { nombre: true } }, condominio: { select: { nombre: true } }, persona: { select: { nombre: true } } },
  });
  if (!u) notFound();
  const [condominios, minutosBloqueo] = await Promise.all([
    u.administradoraId
      ? db.condominio.findMany({ where: { administradoraId: u.administradoraId }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true } })
      : [],
    bloqueoVigente(u.correo, null),
  ]);
  const esYo = u.id === yo.id;
  const roles =
    u.rol === "ADMINISTRADOR" || u.rol === "COMITE"
      ? (["ADMINISTRADOR", "COMITE"] as const).map((r) => ({ valor: r, texto: ETIQUETAS_ROL[r] }))
      : [{ valor: u.rol, texto: ETIQUETAS_ROL[u.rol] }];

  return (
    <>
      <nav aria-label="Ruta" className="mb-2 text-sm text-texto-suave">
        <Link href="/plataforma/usuarios" className="hover:text-marca">
          Usuarios
        </Link>
        <span aria-hidden="true"> › </span>
        <span>{u.nombre}</span>
      </nav>
      <PageHeader
        titulo={u.nombre}
        descripcion={
          <>
            {ETIQUETAS_ROL[u.rol]} · {u.administradora?.nombre ?? "Plataforma"}
            {u.condominio && ` · ${u.condominio.nombre}`}
            {u.persona && ` · persona ${u.persona.nombre}`}
            {" · "}
            {u.ultimoIngresoEn ? `último ingreso ${formatoFechaHora(u.ultimoIngresoEn)}` : "aún no ha ingresado"}
          </>
        }
        acciones={u.activo ? <Insignia tono="exito">Activa</Insignia> : <Insignia tono="peligro">Desactivada</Insignia>}
      />

      {minutosBloqueo > 0 && (
        <Card className="mb-6 border-alerta-suave bg-alerta-suave">
          <p className="mb-3 font-semibold text-alerta">
            El ingreso está bloqueado por intentos fallidos ({minutosBloqueo} {minutosBloqueo === 1 ? "minuto" : "minutos"} más).
          </p>
          <form action={desbloquear.bind(null, u.id)}>
            <Boton type="submit" variante="secundario">
              Desbloquear ahora
            </Boton>
          </form>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-lg font-bold">Datos de la cuenta</h2>
          <DatosForm
            accion={editarDatos.bind(null, u.id)}
            inicial={{ nombre: u.nombre, correo: u.correo, rol: u.rol, condominioId: u.condominioId }}
            roles={roles}
            condominios={condominios}
          />
          {u.rol === "RESIDENTE" && (
            <p className="mt-4 text-sm text-texto-suave">El rol de una cuenta de residente no se cambia: está ligada a su persona y sus unidades.</p>
          )}
        </Card>
        <Card>
          <h2 className="mb-1 text-lg font-bold">Cambiar contraseña</h2>
          <p className="mb-4 text-sm text-texto-suave">
            {esYo
              ? "Tu contraseña de plataforma. Se cerrará tu sesión en otros equipos."
              : "Se cerrarán las sesiones abiertas de esta cuenta. Comunica la clave nueva por un medio seguro."}
          </p>
          <ClaveForm accion={cambiarClaveDe.bind(null, u.id)} />
        </Card>
      </div>

      {!esYo && (
        <Card className="mt-6">
          <h2 className="mb-1 text-lg font-bold">{u.activo ? "Desactivar la cuenta" : "Activar la cuenta"}</h2>
          <p className="mb-4 text-sm text-texto-suave">
            {u.activo
              ? "No podrá ingresar y sus sesiones abiertas dejan de servir. Sus datos y su historial se conservan."
              : "Podrá volver a ingresar con su contraseña."}
          </p>
          <form action={cambiarEstado.bind(null, u.id, !u.activo)}>
            <Boton type="submit" variante={u.activo ? "peligro" : "primario"}>
              {u.activo ? "Desactivar cuenta" : "Activar cuenta"}
            </Boton>
          </form>
        </Card>
      )}
    </>
  );
}
