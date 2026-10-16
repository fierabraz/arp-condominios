import { puedeEditar, requireUsuario } from "@/lib/auth";
import { db } from "@/lib/db";
import { cerrarSesion } from "@/app/login/actions";
import { ETIQUETAS_ROL } from "@/lib/formato";
import { MenuLateral, type EnlaceMenu } from "@/components/menu-lateral";
import type { Rol } from "@/generated/prisma/enums";

function enlaces(rol: Rol, condominioId: string | null): EnlaceMenu[] {
  switch (rol) {
    case "SUPERADMIN":
      return [{ href: "/plataforma", texto: "Administradoras", icono: "edificios" }];
    case "ADMINISTRADOR":
      return [
        { href: "/condominios", texto: "Mis propiedades", icono: "edificios" },
        { href: "/personas", texto: "Propietarios y residentes", icono: "personas" },
        { href: "/usuarios", texto: "Permisos", icono: "permisos" },
        { href: "/reportes", texto: "Reportes globales", icono: "reportes" },
        { href: "/", texto: "Panel de propiedades", icono: "panel" },
        { href: "/condominios/nuevo", texto: "Crear propiedad", icono: "crear" },
        { href: "/proveedores", texto: "Catálogo de proveedores", icono: "proveedores" },
      ];
    case "COMITE":
      return condominioId ? [{ href: `/condominios/${condominioId}`, texto: "Mi propiedad", icono: "edificios" }] : [];
    case "RESIDENTE":
      return [{ href: "/mi-cuenta", texto: "Mi cuenta", icono: "inicio" }];
  }
}

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const usuario = await requireUsuario();
  // Propiedades cuyo menú de módulos puede ver: todas las de la administradora, o la del comité.
  const propiedades =
    usuario.administradoraId && (usuario.rol === "ADMINISTRADOR" || usuario.rol === "COMITE")
      ? await db.condominio.findMany({
          where: {
            administradoraId: usuario.administradoraId,
            ...(usuario.rol === "COMITE" ? { id: usuario.condominioId ?? "" } : {}),
          },
          select: { id: true, nombre: true },
        })
      : [];
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <MenuLateral
        enlaces={enlaces(usuario.rol, usuario.condominioId)}
        subtitulo={usuario.administradora?.nombre ?? "Plataforma"}
        usuario={usuario.nombre}
        rol={ETIQUETAS_ROL[usuario.rol]}
        cerrarSesion={cerrarSesion}
        propiedades={propiedades}
        editable={puedeEditar(usuario.rol)}
      />
      <main className="min-w-0 flex-1 p-4 md:p-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
