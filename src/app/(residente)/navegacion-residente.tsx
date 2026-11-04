"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Building2, ChevronDown, CreditCard, FileText, Home, Megaphone, UserRound, Vote } from "lucide-react";

const ENLACES = [
  { texto: "Inicio", corto: "Inicio", href: "/mi-cuenta", icono: Home, inferior: true },
  { texto: "Mi cuenta", corto: "Cuenta", href: "/mi-cuenta/pagos", icono: CreditCard, inferior: true },
  { texto: "Comunidad", corto: "Comunidad", href: "/mi-cuenta/comunidad", icono: Megaphone, inferior: true },
  { texto: "Documentos", corto: "Documentos", href: "/mi-cuenta/documentos", icono: FileText, inferior: false },
  { texto: "Votaciones", corto: "Votaciones", href: "/mi-cuenta/votaciones", icono: Vote, inferior: true },
  { texto: "Mi perfil", corto: "Perfil", href: "/mi-cuenta/perfil", icono: UserRound, inferior: false },
];

/** Conserva la unidad elegida en el selector al moverse por el portal. */
function useEnlace() {
  const unidad = useSearchParams().get("unidad");
  return (href: string) => (unidad ? `${href}?unidad=${encodeURIComponent(unidad)}` : href);
}

/** Menú del residente: columna lateral en computador y barra inferior en el teléfono. */
export function NavegacionResidente({ variante }: { variante: "lateral" | "inferior" }) {
  const ruta = usePathname();
  const enlace = useEnlace();
  if (variante === "lateral") {
    return (
      <nav aria-label="Menú del residente" className="sticky top-20 hidden w-48 shrink-0 flex-col gap-1 self-start lg:flex">
        {ENLACES.map((e) => {
          const activo = e.href === ruta;
          return (
            <Link
              key={e.href}
              href={enlace(e.href)}
              aria-current={activo ? "page" : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-xl px-3 font-semibold ${
                activo ? "bg-convive-suave text-convive-oscuro" : "text-texto hover:bg-white"
              }`}
            >
              <e.icono size={20} aria-hidden="true" /> {e.texto}
            </Link>
          );
        })}
      </nav>
    );
  }
  const inferiores = ENLACES.filter((e) => e.inferior);
  return (
    <nav
      aria-label="Menú del residente"
      className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-borde bg-white px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden"
    >
      {inferiores.map((e) => {
        const activo = e.href === ruta;
        return (
          <Link
            key={e.href}
            href={enlace(e.href)}
            aria-current={activo ? "page" : undefined}
            className={`flex min-h-12 flex-col items-center justify-center gap-1 text-xs ${
              activo ? "font-bold text-convive-oscuro" : "font-medium text-texto-suave"
            }`}
          >
            <e.icono size={22} aria-hidden="true" />
            {e.corto}
          </Link>
        );
      })}
    </nav>
  );
}

export type OpcionUnidad = { id: string; nombre: string; condominioNombre: string };

/** Nombre de la comunidad y, si el residente tiene varias unidades, el selector para elegir una. */
export function SelectorUnidad({ unidades, compacto = false }: { unidades: OpcionUnidad[]; compacto?: boolean }) {
  const ruta = usePathname();
  const router = useRouter();
  const elegidaId = useSearchParams().get("unidad");
  const elegida = unidades.find((u) => u.id === elegidaId);
  const comunidades = [...new Set(unidades.map((u) => u.condominioNombre))];
  const nombre = elegida?.condominioNombre ?? (comunidades.length === 1 ? comunidades[0] : "Mis comunidades");
  const texto = compacto ? "text-sm text-texto-suave" : "font-medium text-texto";

  if (unidades.length <= 1) {
    return (
      <span className={`flex min-w-0 items-center gap-2 ${texto}`}>
        {!compacto && <Building2 size={20} aria-hidden="true" className="shrink-0 text-convive-oscuro" />}
        <span className="truncate">{nombre}</span>
      </span>
    );
  }
  return (
    <label className={`relative flex min-w-0 items-center gap-2 ${texto}`}>
      {!compacto && <Building2 size={20} aria-hidden="true" className="shrink-0 text-convive-oscuro" />}
      <span className="sr-only">Elegir unidad</span>
      <select
        value={elegida?.id ?? ""}
        onChange={(ev) => router.push(ev.target.value ? `${ruta}?unidad=${encodeURIComponent(ev.target.value)}` : ruta)}
        className="min-h-11 min-w-0 max-w-full cursor-pointer appearance-none truncate rounded-xl bg-transparent py-1 pr-7 pl-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-convive"
      >
        <option value="">{comunidades.length === 1 ? `${comunidades[0]} · todas mis unidades` : "Todas mis unidades"}</option>
        {unidades.map((u) => (
          <option key={u.id} value={u.id}>
            {u.condominioNombre} · {u.nombre}
          </option>
        ))}
      </select>
      <ChevronDown size={18} aria-hidden="true" className="pointer-events-none absolute right-1" />
    </label>
  );
}
