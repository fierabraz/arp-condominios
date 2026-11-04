"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCard, Home, UserRound, Users } from "lucide-react";

const ENLACES = [
  { texto: "Inicio", href: "/mi-cuenta", icono: Home },
  { texto: "Mis pagos", href: "/mi-cuenta#pagos", icono: CreditCard },
  { texto: "Comunidad", href: "/mi-cuenta#muro", icono: Users },
  { texto: "Mi perfil", href: "/mi-cuenta/perfil", icono: UserRound },
];

/** Navegación del residente: barra inferior en el teléfono y enlaces en la cabecera en pantallas grandes. */
export function NavegacionResidente({ variante }: { variante: "inferior" | "cabecera" }) {
  const ruta = usePathname();
  const activo = (href: string) => href === ruta;
  if (variante === "cabecera") {
    return (
      <nav aria-label="Navegación del residente" className="hidden items-center gap-1 md:flex">
        {ENLACES.map((e) => (
          <Link
            key={e.texto}
            href={e.href}
            aria-current={activo(e.href) ? "page" : undefined}
            className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold ${
              activo(e.href) ? "bg-marca-suave text-marca" : "text-texto hover:bg-fondo"
            }`}
          >
            <e.icono size={18} aria-hidden="true" /> {e.texto}
          </Link>
        ))}
      </nav>
    );
  }
  return (
    <nav
      aria-label="Navegación del residente"
      className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-borde bg-white px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden"
    >
      {ENLACES.map((e) => (
        <Link
          key={e.texto}
          href={e.href}
          aria-current={activo(e.href) ? "page" : undefined}
          className={`flex min-h-12 flex-col items-center justify-center gap-1 text-xs ${
            activo(e.href) ? "font-bold text-marca" : "font-medium text-texto-suave"
          }`}
        >
          <e.icono size={22} aria-hidden="true" />
          {e.texto}
        </Link>
      ))}
    </nav>
  );
}
