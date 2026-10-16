import { requireUsuario } from "@/lib/auth";
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
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <MenuLateral
        enlaces={enlaces(usuario.rol, usuario.condominioId)}
        titulo="ERP Condominios"
        subtitulo={usuario.administradora?.nombre ?? "Plataforma"}
        usuario={usuario.nombre}
        rol={ETIQUETAS_ROL[usuario.rol]}
        cerrarSesion={cerrarSesion}
      />
      <main className="flex-1 p-4 md:p-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
