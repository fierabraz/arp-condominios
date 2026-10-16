"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Building2,
  ChartLine,
  Home,
  KeyRound,
  ListChecks,
  Lock,
  LogOut,
  Menu,
  Truck,
  Users,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";

export const ICONOS = {
  edificios: Building2,
  permisos: Lock,
  reportes: ListChecks,
  panel: ChartLine,
  crear: Zap,
  proveedores: Truck,
  personas: Users,
  inicio: Home,
} satisfies Record<string, LucideIcon>;

export type EnlaceMenu = { href: string; texto: string; icono: keyof typeof ICONOS };

/** Enlace activo: coincidencia exacta, o la sección más específica que contiene la ruta actual. */
function activo(href: string, ruta: string, enlaces: EnlaceMenu[]) {
  if (href === "/") return ruta === "/";
  if (ruta !== href && !ruta.startsWith(href + "/")) return false;
  return !enlaces.some((e) => e.href.length > href.length && (ruta === e.href || ruta.startsWith(e.href + "/")));
}

export function MenuLateral({
  enlaces,
  titulo,
  subtitulo,
  usuario,
  rol,
  cerrarSesion,
}: {
  enlaces: EnlaceMenu[];
  titulo: string;
  subtitulo: string;
  usuario: string;
  rol: string;
  cerrarSesion: () => Promise<void>;
}) {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  const [rutaAbierta, setRutaAbierta] = useState(ruta);
  // Al navegar, el menú desplegable del celular se cierra solo.
  if (rutaAbierta !== ruta) {
    setRutaAbierta(ruta);
    setAbierto(false);
  }

  return (
    <aside className="bg-[#23232f] text-gray-200 md:sticky md:top-0 md:flex md:h-screen md:w-64 md:shrink-0 md:flex-col">
      <div className="flex items-center justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="text-lg font-semibold text-white">{titulo}</p>
          <p className="truncate text-sm text-gray-400">{subtitulo}</p>
        </div>
        <button
          type="button"
          onClick={() => setAbierto(!abierto)}
          className="rounded-lg p-2 text-gray-300 hover:bg-white/10 md:hidden"
          aria-label={abierto ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={abierto}
        >
          {abierto ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      <div className={`${abierto ? "block" : "hidden"} md:flex md:flex-1 md:flex-col`}>
        <nav className="flex flex-col gap-1 px-3 pb-3">
          {enlaces.map((e) => {
            const Icono = ICONOS[e.icono];
            const esActivo = activo(e.href, ruta, enlaces);
            return (
              <Link
                key={e.href}
                href={e.href}
                aria-current={esActivo ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] transition ${
                  esActivo ? "bg-white/15 font-medium text-white" : "text-gray-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icono size={18} strokeWidth={2.2} className="shrink-0" />
                {e.texto}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-white/10 p-4">
          <p className="truncate px-2 text-sm font-medium text-white">{usuario}</p>
          <p className="px-2 text-xs text-gray-400">{rol}</p>
          <Link
            href="/contrasena"
            className="mt-3 flex items-center gap-3 rounded-lg px-2 py-2 text-sm text-gray-300 hover:bg-white/10 hover:text-white"
          >
            <KeyRound size={16} /> Cambiar contraseña
          </Link>
          <form action={cerrarSesion}>
            <button className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm text-gray-300 hover:bg-white/10 hover:text-white">
              <LogOut size={16} /> Cerrar sesión
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
