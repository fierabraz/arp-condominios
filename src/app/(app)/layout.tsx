import { redirect } from "next/navigation";
import { puedeEditar, requireUsuario } from "@/lib/auth";
import { db } from "@/lib/db";
import { cerrarSesion } from "@/app/login/actions";
import { ETIQUETAS_ROL } from "@/lib/formato";
import { MenuLateral, type EnlaceMenu } from "@/components/menu-lateral";
import type { Rol } from "@/generated/prisma/enums";
import { esPrincipal, filtroCondominios } from "@/lib/permisos";

function enlaces(rol: Rol, condominioId: string | null, principal: boolean): EnlaceMenu[] {
  switch (rol) {
    case "SUPERADMIN":
      return [
        { href: "/plataforma", texto: "Administradoras", icono: "edificios" },
        { href: "/plataforma/usuarios", texto: "Usuarios", icono: "personas" },
        { href: "/plataforma/correo", texto: "Correo", icono: "correo" },
      ];
    case "ADMINISTRADOR":
      // Permisos y Crear propiedad son solo del administrador principal.
      return [
        { href: "/condominios", texto: "Mis propiedades", icono: "edificios" as const },
        { href: "/personas", texto: "Propietarios y residentes", icono: "personas" as const },
        ...(principal ? [{ href: "/usuarios", texto: "Permisos", icono: "permisos" as const }] : []),
        { href: "/reportes", texto: "Reportes globales", icono: "reportes" as const },
        { href: "/", texto: "Panel de propiedades", icono: "panel" as const },
        ...(principal ? [{ href: "/condominios/nuevo", texto: "Crear propiedad", icono: "crear" as const }] : []),
        { href: "/proveedores", texto: "Catálogo de proveedores", icono: "proveedores" as const },
        { href: "/registro", texto: "Registro de cambios", icono: "registro" as const },
      ];
    case "COMITE":
      return condominioId ? [{ href: `/condominios/${condominioId}`, texto: "Mi propiedad", icono: "edificios" }] : [];
    case "RESIDENTE":
      return [{ href: "/mi-cuenta", texto: "Mi cuenta", icono: "inicio" }];
  }
}

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const usuario = await requireUsuario();
  // Los residentes tienen su propio espacio, separado del de administración.
  if (usuario.rol === "RESIDENTE") redirect("/mi-cuenta");
  // Propiedades cuyo menú de módulos puede ver: las de su alcance (todas, las asignadas o la del comité).
  const propiedades =
    usuario.administradoraId && (usuario.rol === "ADMINISTRADOR" || usuario.rol === "COMITE")
      ? await db.condominio.findMany({
          where: { administradoraId: usuario.administradoraId, ...filtroCondominios(usuario) },
          select: { id: true, nombre: true },
        })
      : [];
  return (
    <div className="fondo-convive flex min-h-screen flex-col md:flex-row">
      <MenuLateral
        enlaces={enlaces(usuario.rol, usuario.condominioId, esPrincipal(usuario))}
        subtitulo={usuario.administradora?.nombre ?? "Plataforma"}
        usuario={usuario.nombre}
        rol={ETIQUETAS_ROL[usuario.rol]}
        cerrarSesion={cerrarSesion}
        propiedades={propiedades}
        editable={puedeEditar(usuario)}
      />
      <main className="min-w-0 flex-1 p-4 md:p-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
