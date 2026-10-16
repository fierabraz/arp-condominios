"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import {
  ArrowLeft,
  Banknote,
  BellRing,
  Briefcase,
  Building,
  Building2,
  ChartLine,
  ChevronDown,
  Home,
  KeyRound,
  ListChecks,
  Lock,
  LogOut,
  Menu,
  Search,
  Settings,
  Star,
  Truck,
  Users,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { FAVORITOS_INICIALES, GRUPOS_MODULOS, TODOS_LOS_MODULOS, rutaModulo, type Modulo } from "@/lib/modulos";

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

const ICONOS_GRUPO: Record<string, LucideIcon> = {
  cobranza: Banknote,
  conserjeria: BellRing,
  finanzas: ChartLine,
  comunidad: Building,
  remuneraciones: Briefcase,
};

export type PropiedadMenu = { id: string; nombre: string };

// Favoritos del menú: preferencia de cada navegador, guardada en localStorage.
const CLAVE_FAVORITOS = "erp-favoritos-modulos";
const avisos = new Set<() => void>();
function leerFavoritos(): string {
  try {
    return localStorage.getItem(CLAVE_FAVORITOS) ?? JSON.stringify(FAVORITOS_INICIALES);
  } catch {
    return JSON.stringify(FAVORITOS_INICIALES);
  }
}
function guardarFavoritos(claves: string[]) {
  try {
    localStorage.setItem(CLAVE_FAVORITOS, JSON.stringify(claves));
  } catch {
    // Sin almacenamiento (modo privado): el cambio dura hasta recargar.
  }
  avisos.forEach((f) => f());
}
function useFavoritos(): [string[], (clave: string) => void] {
  const crudo = useSyncExternalStore(
    (f) => {
      avisos.add(f);
      return () => avisos.delete(f);
    },
    leerFavoritos,
    () => JSON.stringify(FAVORITOS_INICIALES),
  );
  let lista: string[];
  try {
    lista = JSON.parse(crudo);
  } catch {
    lista = FAVORITOS_INICIALES;
  }
  const alternar = (clave: string) =>
    guardarFavoritos(lista.includes(clave) ? lista.filter((c) => c !== clave) : [...lista, clave]);
  return [lista, alternar];
}

export type EnlaceMenu = { href: string; texto: string; icono: keyof typeof ICONOS };

/** Enlace activo: coincidencia exacta, o la sección más específica que contiene la ruta actual. */
function activo(href: string, ruta: string, enlaces: EnlaceMenu[]) {
  if (href === "/") return ruta === "/";
  if (ruta !== href && !ruta.startsWith(href + "/")) return false;
  return !enlaces.some((e) => e.href.length > href.length && (ruta === e.href || ruta.startsWith(e.href + "/")));
}

const claseEnlace = (activo: boolean) =>
  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] transition ${
    activo ? "bg-white/15 font-medium text-white" : "text-gray-300 hover:bg-white/10 hover:text-white"
  }`;

function MenuPrincipal({ enlaces, ruta }: { enlaces: EnlaceMenu[]; ruta: string }) {
  return (
    <nav className="flex flex-col gap-1 px-3 pb-3">
      {enlaces.map((e) => {
        const Icono = ICONOS[e.icono];
        const esActivo = activo(e.href, ruta, enlaces);
        return (
          <Link key={e.href} href={e.href} aria-current={esActivo ? "page" : undefined} className={claseEnlace(esActivo)}>
            <Icono size={18} strokeWidth={2.2} className="shrink-0" />
            {e.texto}
          </Link>
        );
      })}
    </nav>
  );
}

function MenuPropiedad({
  propiedad,
  ruta,
  editable,
  volver,
}: {
  propiedad: PropiedadMenu;
  ruta: string;
  editable: boolean;
  volver: boolean;
}) {
  const base = `/condominios/${propiedad.id}`;
  const [busqueda, setBusqueda] = useState("");
  const [favoritos, alternarFavorito] = useFavoritos();
  const esActual = (href: string) => ruta === href || ruta.startsWith(href + "/");
  const grupoActual = GRUPOS_MODULOS.find((g) => g.modulos.some((m) => esActual(rutaModulo(propiedad.id, m))))?.clave;
  const [abiertos, setAbiertos] = useState<string[]>(grupoActual ? [grupoActual] : []);
  const visibles = (m: Modulo) => editable || !m.soloAdmin;

  const filaModulo = (m: Modulo, sangria = true) => {
    const href = rutaModulo(propiedad.id, m);
    const fav = favoritos.includes(m.clave);
    const actual = esActual(href);
    return (
      <div key={m.clave} className="group flex items-center">
        <Link
          href={href}
          aria-current={actual ? "page" : undefined}
          className={`flex-1 rounded-lg py-1.5 pr-2 text-[14px] transition ${sangria ? "pl-11" : "pl-3"} ${
            actual ? "bg-white/15 font-medium text-white" : "text-gray-300 hover:bg-white/10 hover:text-white"
          }`}
        >
          {m.texto}
          {!m.ruta && <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-gray-400">Pronto</span>}
        </Link>
        <button
          type="button"
          onClick={() => alternarFavorito(m.clave)}
          aria-label={fav ? `Quitar ${m.texto} de favoritos` : `Agregar ${m.texto} a favoritos`}
          aria-pressed={fav}
          className={`rounded p-1.5 ${fav ? "text-amber-400" : "text-gray-500 opacity-0 hover:text-amber-300 group-hover:opacity-100 focus:opacity-100"}`}
        >
          <Star size={15} fill={fav ? "currentColor" : "none"} />
        </button>
      </div>
    );
  };

  const texto = busqueda.trim().toLowerCase();
  const resultados = texto
    ? TODOS_LOS_MODULOS.filter((m) => visibles(m) && m.texto.toLowerCase().includes(texto))
    : [];
  const listaFavoritos = TODOS_LOS_MODULOS.filter((m) => visibles(m) && favoritos.includes(m.clave));

  return (
    <nav className="flex flex-col gap-1 px-3 pb-3">
      {volver && (
        <Link href="/condominios" className="mb-1 flex items-center gap-2 px-3 py-1 text-sm text-gray-400 hover:text-white">
          <ArrowLeft size={15} /> Mis propiedades
        </Link>
      )}
      <p className="px-3 pb-2 text-base font-semibold text-white">{propiedad.nombre}</p>
      <label className="mx-1 mb-2 flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm">
        <Search size={15} className="text-gray-400" />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar módulos"
          className="w-full bg-transparent text-gray-100 placeholder:text-gray-500 focus:outline-none"
        />
      </label>

      {texto ? (
        resultados.length ? (
          resultados.map((m) => filaModulo(m, false))
        ) : (
          <p className="px-3 py-2 text-sm text-gray-500">Sin resultados.</p>
        )
      ) : (
        <>
          {listaFavoritos.length > 0 && (
            <div className="mb-1 border-b border-white/10 pb-2">
              <p className="flex items-center gap-3 px-3 py-2 text-[15px] text-gray-200">
                <Star size={18} className="text-amber-400" fill="currentColor" /> Favoritos
              </p>
              {listaFavoritos.map((m) => filaModulo(m))}
            </div>
          )}
          <Link href={base} aria-current={ruta === base ? "page" : undefined} className={claseEnlace(ruta === base)}>
            <Home size={18} strokeWidth={2.2} /> Panel
          </Link>
          {editable && (
            <Link href={`${base}/editar`} className={claseEnlace(ruta === `${base}/editar`)}>
              <Settings size={18} strokeWidth={2.2} /> Configurar propiedad
            </Link>
          )}
          {GRUPOS_MODULOS.map((g) => {
            const Icono = ICONOS_GRUPO[g.icono];
            const modulos = g.modulos.filter(visibles);
            if (modulos.length === 1) {
              const m = modulos[0];
              const href = rutaModulo(propiedad.id, m);
              return (
                <Link key={g.clave} href={href} className={claseEnlace(esActual(href))}>
                  <Icono size={18} strokeWidth={2.2} /> {g.texto}
                  {!m.ruta && <span className="ml-auto rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-gray-400">Pronto</span>}
                </Link>
              );
            }
            const abierto = abiertos.includes(g.clave);
            return (
              <div key={g.clave}>
                <button
                  type="button"
                  aria-expanded={abierto}
                  onClick={() => setAbiertos(abierto ? abiertos.filter((c) => c !== g.clave) : [...abiertos, g.clave])}
                  className={`${claseEnlace(false)} w-full text-left`}
                >
                  <Icono size={18} strokeWidth={2.2} /> {g.texto}
                  <ChevronDown size={16} className={`ml-auto transition ${abierto ? "rotate-180" : ""}`} />
                </button>
                {abierto && <div className="pb-1">{modulos.map((m) => filaModulo(m))}</div>}
              </div>
            );
          })}
        </>
      )}
    </nav>
  );
}

export function MenuLateral({
  enlaces,
  titulo,
  subtitulo,
  usuario,
  rol,
  cerrarSesion,
  propiedades = [],
  editable = false,
}: {
  propiedades?: PropiedadMenu[];
  editable?: boolean;
  enlaces: EnlaceMenu[];
  titulo: string;
  subtitulo: string;
  usuario: string;
  rol: string;
  cerrarSesion: () => Promise<void>;
}) {
  const ruta = usePathname();
  const idEnRuta = /^\/condominios\/([^/]+)/.exec(ruta)?.[1];
  const propiedad = propiedades.find((p) => p.id === idEnRuta);
  const [abierto, setAbierto] = useState(false);
  const [rutaAbierta, setRutaAbierta] = useState(ruta);
  // Al navegar, el menú desplegable del celular se cierra solo.
  if (rutaAbierta !== ruta) {
    setRutaAbierta(ruta);
    setAbierto(false);
  }

  return (
    <aside className="bg-[#23232f] text-gray-200 md:sticky md:top-0 md:flex md:h-screen md:w-72 md:shrink-0 md:flex-col">
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

      <div className={`${abierto ? "block" : "hidden"} md:flex md:min-h-0 md:flex-1 md:flex-col`}>
        <div className="md:min-h-0 md:flex-1 md:overflow-y-auto">
        {propiedad ? (
          <MenuPropiedad
            key={propiedad.id}
            propiedad={propiedad}
            ruta={ruta}
            editable={editable}
            volver={propiedades.length > 1 || editable}
          />
        ) : (
          <MenuPrincipal enlaces={enlaces} ruta={ruta} />
        )}
        </div>

        <div className="mt-auto shrink-0 border-t border-white/10 p-4">
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
