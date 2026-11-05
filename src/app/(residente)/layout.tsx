import { Suspense } from "react";
import Link from "next/link";
import { Bell, ChevronDown, LogOut, UserRound } from "lucide-react";
import { requireUsuario } from "@/lib/auth";
import { cerrarSesion } from "@/app/login/actions";
import { LogoResidente } from "@/components/logo";
import { datosInicio } from "./datos-residente";
import { NavegacionResidente, SelectorUnidad } from "./navegacion-residente";

const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

// Espacio de los residentes: separado del de administración, sin su menú ni sus módulos.
export default async function ResidenteLayout({ children }: LayoutProps<"/">) {
  const usuario = await requireUsuario(["RESIDENTE"]);
  const datos = await datosInicio(usuario);
  const avisos = datos.alertas.filter((a) => a.nivel !== "informativo").length;
  const unidades = datos.todas.map((u) => ({ id: u.id, nombre: u.nombre, condominioNombre: u.condominioNombre }));

  return (
    <div className="fondo-convive min-h-screen">
      <header className="sticky top-0 z-30 border-b border-borde bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 md:gap-5">
          <Link href="/mi-cuenta" aria-label="Inicio" className="shrink-0 rounded-xl focus-visible:ring-2 focus-visible:ring-convive">
            <LogoResidente />
          </Link>
          <span aria-hidden="true" className="hidden h-8 w-px bg-borde md:block" />
          <div className="hidden min-w-0 md:block">
            <Suspense>
              <SelectorUnidad unidades={unidades} />
            </Suspense>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Link
              href="/mi-cuenta#importante"
              aria-label={avisos ? `Información importante: ${avisos} pendiente${avisos === 1 ? "" : "s"}` : "Información importante"}
              className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl text-texto hover:bg-fondo"
            >
              <Bell size={22} aria-hidden="true" />
              {avisos > 0 && (
                <span className="absolute top-1.5 right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-naranja px-1 text-xs font-bold text-texto">
                  {avisos}
                </span>
              )}
            </Link>
            <details className="group relative">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-2 hover:bg-fondo [&::-webkit-details-marker]:hidden">
                <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-convive-suave text-sm font-bold text-convive-oscuro">
                  {iniciales(usuario.nombre)}
                </span>
                <span className="hidden max-w-40 truncate font-medium md:inline">{usuario.nombre}</span>
                <span className="sr-only md:hidden">Mi cuenta de usuario</span>
                <ChevronDown size={18} aria-hidden="true" className="hidden transition group-open:rotate-180 md:block" />
              </summary>
              <div className="absolute right-0 mt-2 w-56 sombra-convive rounded-2xl border border-borde bg-white p-2 shadow-lg">
                <p className="truncate px-3 py-2 text-sm text-texto-suave">{usuario.correo}</p>
                <Link href="/mi-cuenta/perfil" className="flex min-h-11 items-center gap-2 rounded-xl px-3 font-semibold hover:bg-fondo">
                  <UserRound size={18} aria-hidden="true" /> Mi perfil
                </Link>
                <form action={cerrarSesion}>
                  <button className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 font-semibold hover:bg-fondo">
                    <LogOut size={18} aria-hidden="true" /> Salir
                  </button>
                </form>
              </div>
            </details>
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl gap-6 p-4 pb-28 md:p-8">
        <Suspense>
          <NavegacionResidente variante="lateral" />
        </Suspense>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
      <Suspense>
        <NavegacionResidente variante="inferior" />
      </Suspense>
    </div>
  );
}
