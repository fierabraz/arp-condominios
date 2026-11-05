import { requirePrincipal } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader, Tabla } from "@/components/ui";
import { ETIQUETAS_ROL } from "@/lib/formato";
import { UsuarioForm } from "./usuario-form";
import { crearUsuario, eliminarUsuario, guardarAcceso } from "./actions";
import { AccesoForm } from "./acceso-form";

export default async function UsuariosPage() {
  const { usuario: actual, administradoraId } = await requirePrincipal();
  const [usuarios, condominios, personas] = await Promise.all([
    db.usuario.findMany({
      where: { administradoraId },
      orderBy: { nombre: "asc" },
      include: {
        condominio: { select: { nombre: true } },
        persona: { select: { nombre: true } },
        asignaciones: { select: { condominioId: true, condominio: { select: { nombre: true } } } },
      },
    }),
    db.condominio.findMany({ where: { administradoraId }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
    db.persona.findMany({
      where: { administradoraId, usuario: null },
      select: { id: true, nombre: true },
      orderBy: { nombre: "asc" },
    }),
  ]);

  return (
    <>
      <PageHeader
        titulo="Permisos"
        descripcion="Quién puede entrar al sistema y qué puede ver. Un administrador principal ve todas las propiedades; los demás, solo las que les asignes."
      />
      <Card className="mb-6">
        <h2 className="mb-4 font-medium">Nueva cuenta</h2>
        <UsuarioForm accion={crearUsuario} condominios={condominios} personas={personas} />
      </Card>
      <Tabla>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Correo</th>
            <th>Rol</th>
            <th>Acceso a</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map((u) => (
            <tr key={u.id}>
              <td className="font-medium">{u.nombre}</td>
              <td>{u.correo}</td>
              <td>{ETIQUETAS_ROL[u.rol]}</td>
              <td className="text-texto-suave">
                {u.rol === "ADMINISTRADOR" ? (
                  <>
                    {u.accesoTodas
                      ? "Todas las propiedades (principal)"
                      : u.asignaciones.length
                        ? u.asignaciones.map((a) => a.condominio.nombre).sort().join(", ")
                        : "Ninguna propiedad todavía"}
                    <div className="mt-2">
                      <AccesoForm
                        accion={guardarAcceso.bind(null, u.id)}
                        condominios={condominios}
                        todas={u.accesoTodas}
                        asignados={u.asignaciones.map((a) => a.condominioId)}
                      />
                    </div>
                  </>
                ) : (
                  (u.condominio?.nombre ?? u.persona?.nombre ?? "Todo")
                )}
              </td>
              <td className="text-right">
                {u.id !== actual.id && (
                  <form action={eliminarUsuario.bind(null, u.id)}>
                    <button className="text-sm text-peligro hover:underline">Eliminar</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </Tabla>
    </>
  );
}
