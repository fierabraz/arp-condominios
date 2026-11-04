import { LogOut } from "lucide-react";
import { requireUsuario } from "@/lib/auth";
import { cerrarSesion } from "@/app/login/actions";
import { Logo } from "@/components/logo";
import { NavegacionResidente } from "./navegacion-residente";

// Espacio de los residentes: separado del de administración, sin su menú ni sus módulos.
export default async function ResidenteLayout({ children }: LayoutProps<"/">) {
  const usuario = await requireUsuario(["RESIDENTE"]);
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-borde bg-white">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between gap-4 px-4">
          <Logo subtitulo={usuario.administradora?.nombre} />
          <NavegacionResidente variante="cabecera" />
          <form action={cerrarSesion}>
            <button className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-texto hover:bg-fondo">
              <LogOut size={18} aria-hidden="true" /> Salir
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-4xl p-4 pb-28 md:p-8">{children}</main>
      <NavegacionResidente variante="inferior" />
    </div>
  );
}
