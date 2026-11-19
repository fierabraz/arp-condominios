import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, Insignia, PageHeader, Tabla } from "@/components/ui";
import { textoPerfil } from "@/lib/cuentas-reglas";
import { PERMISOS_ASIGNABLES, esPermisoAsignable } from "@/lib/permisos";
import { eliminarUsuario, guardarPerfil, invitarMiembro, renovarInvitacion } from "./actions";
import { InvitarEquipoForm, PerfilForm, RenovarInvitacion } from "./formularios";

// PILOTO-001: el equipo de la administración (antes "Permisos"). Las cuentas de residentes no se
// crean aquí: se invitan desde cada comunidad o se aprueban sus solicitudes.
export default async function UsuariosPage() {
  const { usuario: actual, administradoraId } = await requirePrincipal();
  const [usuarios, condominios, residentes] = await Promise.all([
    db.usuario.findMany({
      where: { administradoraId, rol: { in: ["ADMINISTRADOR", "COMITE"] } },
      orderBy: { nombre: "asc" },
      include: {
        condominio: { select: { nombre: true } },
        asignaciones: { select: { condominioId: true, condominio: { select: { nombre: true } } } },
      },
    }),
    db.condominio.findMany({ where: { administradoraId }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
    db.usuario.count({ where: { administradoraId, rol: "RESIDENTE" } }),
  ]);

  const perfilDeCuenta = (u: (typeof usuarios)[number]) =>
    u.rol === "COMITE" ? "COMITE" : u.cargo ? u.cargo : u.accesoTodas ? "PRINCIPAL" : "ADMINISTRADOR";

  return (
    <>
      <PageHeader
        titulo="Equipo y permisos"
        descripcion="Quién de tu equipo entra a Convive y qué puede ver y hacer. Cada persona recibe una invitación y crea su propia contraseña."
      />
      <Card className="mb-6">
        <h2 className="mb-4 text-lg font-bold">Invitar a alguien del equipo</h2>
        <InvitarEquipoForm accion={invitarMiembro} condominios={condominios} />
      </Card>
      <Tabla>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Perfil</th>
            <th>Acceso a</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map((u) => {
            const invitacionPendiente = !u.correoVerificadoEn;
            const extras = u.permisosExtra.filter(esPermisoAsignable);
            return (
              <tr key={u.id}>
                <td>
                  <span className="font-medium">{u.nombre}</span>
                  <span className="block text-texto-suave">{u.correo}</span>
                </td>
                <td>
                  {textoPerfil(u)}
                  {u.cargo === "ASISTENTE" && extras.length > 0 && (
                    <span className="block text-xs text-texto-suave">Además: {extras.map((e) => PERMISOS_ASIGNABLES[e].toLowerCase()).join("; ")}</span>
                  )}
                </td>
                <td className="text-texto-suave">
                  {u.rol === "COMITE"
                    ? (u.condominio?.nombre ?? "—")
                    : u.accesoTodas && !u.cargo
                      ? "Todas las comunidades"
                      : u.asignaciones.length
                        ? u.asignaciones.map((a) => a.condominio.nombre).sort().join(", ")
                        : "Ninguna comunidad todavía"}
                  {u.id !== actual.id && (
                    <div className="mt-2">
                      <PerfilForm
                        accion={guardarPerfil.bind(null, u.id)}
                        condominios={condominios}
                        perfil={perfilDeCuenta(u)}
                        asignados={u.rol === "COMITE" ? (u.condominioId ? [u.condominioId] : []) : u.asignaciones.map((a) => a.condominioId)}
                        extras={extras}
                      />
                    </div>
                  )}
                </td>
                <td>
                  {!u.activo ? (
                    <Insignia tono="peligro">Desactivada</Insignia>
                  ) : invitacionPendiente ? (
                    <div className="space-y-1">
                      <Insignia tono="alerta">Invitación pendiente</Insignia>
                      <RenovarInvitacion renovar={renovarInvitacion.bind(null, u.id)} />
                    </div>
                  ) : (
                    <Insignia tono="exito">Activa</Insignia>
                  )}
                </td>
                <td className="text-right">
                  {u.id !== actual.id && (
                    <form action={eliminarUsuario.bind(null, u.id)}>
                      <button className="min-h-11 text-sm text-peligro hover:underline">Eliminar</button>
                    </form>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Tabla>
      <p className="mt-4 text-sm text-texto-suave">
        {residentes} {residentes === 1 ? "cuenta de residente" : "cuentas de residentes"}. Los residentes y propietarios se suman desde cada
        comunidad: <strong>Invitar residentes</strong> (por correo o WhatsApp) o <strong>Solicitudes de residentes</strong> (con el código de
        la comunidad). Revisa a las personas en <Link href="/personas" className="font-semibold text-marca hover:underline">Propietarios y residentes</Link>.
      </p>
    </>
  );
}
