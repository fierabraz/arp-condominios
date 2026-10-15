import Link from "next/link";
import { requireUsuario } from "@/lib/auth";
import { cerrarSesion } from "@/app/login/actions";
import { ETIQUETAS_ROL } from "@/lib/formato";
import type { Rol } from "@/generated/prisma/enums";

function enlaces(rol: Rol, condominioId: string | null) {
  switch (rol) {
    case "SUPERADMIN":
      return [{ href: "/plataforma", texto: "Administradoras" }];
    case "ADMINISTRADOR":
      return [
        { href: "/", texto: "Inicio" },
        { href: "/condominios", texto: "Condominios" },
        { href: "/personas", texto: "Personas" },
        { href: "/usuarios", texto: "Usuarios" },
      ];
    case "COMITE":
      return condominioId ? [{ href: `/condominios/${condominioId}`, texto: "Mi condominio" }] : [];
    case "RESIDENTE":
      return [{ href: "/mi-cuenta", texto: "Mi cuenta" }];
  }
}

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const usuario = await requireUsuario();
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b border-gray-200 bg-white md:w-60 md:shrink-0 md:border-b-0 md:border-r">
        <div className="p-5">
          <p className="text-lg font-semibold">ERP Condominios</p>
          <p className="truncate text-sm text-gray-600">
            {usuario.administradora?.nombre ?? "Plataforma"}
          </p>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col">
          {enlaces(usuario.rol, usuario.condominioId).map((e) => (
            <Link
              key={e.href}
              href={e.href}
              className="whitespace-nowrap rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              {e.texto}
            </Link>
          ))}
          <Link
            href="/contrasena"
            className="whitespace-nowrap rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 md:hidden"
          >
            Contraseña
          </Link>
          <form action={cerrarSesion} className="md:hidden">
            <button className="whitespace-nowrap rounded-lg px-3 py-2 text-sm text-blue-700">Salir</button>
          </form>
        </nav>
        <div className="hidden border-t border-gray-200 p-5 md:block">
          <p className="truncate text-sm font-medium">{usuario.nombre}</p>
          <p className="text-xs text-gray-500">{ETIQUETAS_ROL[usuario.rol]}</p>
          <Link href="/contrasena" className="mt-3 block text-sm text-blue-700 hover:underline">
            Cambiar contraseña
          </Link>
          <form action={cerrarSesion} className="mt-1">
            <button className="text-sm text-blue-700 hover:underline">Cerrar sesión</button>
          </form>
        </div>
      </aside>
      <main className="flex-1 p-4 md:p-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
