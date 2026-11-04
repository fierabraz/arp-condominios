"use client";

import { useId, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  Bell,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileBadge,
  KeyRound,
  Megaphone,
  Send,
  ShieldCheck,
  CalendarDays,
  Wallet,
  Wrench,
  Vote,
  CreditCard,
  type LucideIcon,
} from "lucide-react";

const ICONOS = {
  informarme: ClipboardList,
  gestion: ShieldCheck,
  cuenta: Wallet,
  avisos: Bell,
  rendiciones: BarChart3,
  noticias: Megaphone,
  votar: Vote,
  clave: KeyRound,
  pagar: CreditCard,
  certificado: FileBadge,
  solicitud: Send,
  reserva: CalendarDays,
  incidencia: Wrench,
} satisfies Record<string, LucideIcon>;

export type IconoAcceso = keyof typeof ICONOS;
export type Acceso = { texto: string; icono: IconoAcceso; href?: string; insignia?: string };

/**
 * Tarjeta principal del inicio ("Quiero informarme" / "Quiero realizar una gestión").
 * En el teléfono se muestra cerrada, para ver las dos opciones de un vistazo, y se abre al tocarla.
 * Los accesos sin `href` todavía no existen: se muestran como "Pronto", sin enlace.
 */
export function TarjetaAccesos({
  titulo,
  descripcion,
  icono,
  accesos,
}: {
  titulo: string;
  descripcion: string;
  icono: IconoAcceso;
  accesos: Acceso[];
}) {
  const [abierta, setAbierta] = useState(false);
  const idLista = useId();
  const Icono = ICONOS[icono];
  const disponibles = accesos.filter((a) => a.href);
  const pronto = accesos.filter((a) => !a.href);

  const encabezado = (
    <>
      <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-convive text-white shadow-sm">
        <Icono size={28} />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-xl leading-tight font-bold text-convive-oscuro md:text-2xl">{titulo}</span>
        <span className="mt-1 block text-sm text-texto-suave">{descripcion}</span>
      </span>
    </>
  );

  return (
    <section aria-label={titulo} className="flex flex-col rounded-3xl border border-convive/30 bg-white/90 p-4 shadow-sm md:p-5">
      <button
        type="button"
        onClick={() => setAbierta((a) => !a)}
        aria-expanded={abierta}
        aria-controls={idLista}
        className="flex w-full items-center gap-3 rounded-2xl text-left focus-visible:ring-2 focus-visible:ring-convive md:hidden"
      >
        {encabezado}
        <ChevronDown size={22} aria-hidden="true" className={`shrink-0 text-convive-oscuro transition ${abierta ? "rotate-180" : ""}`} />
      </button>
      <h2 className="hidden items-center gap-3 md:flex">{encabezado}</h2>

      <div id={idLista} className={`${abierta ? "block" : "hidden"} mt-4 md:block`}>
        <ul className="space-y-2">
          {disponibles.map((a) => {
            const I = ICONOS[a.icono];
            return (
              <li key={a.texto}>
                <Link
                  href={a.href!}
                  className="flex min-h-12 items-center gap-3 rounded-2xl bg-convive-suave/60 px-4 py-2 font-semibold text-texto hover:bg-convive-suave focus-visible:ring-2 focus-visible:ring-convive"
                >
                  <I size={20} aria-hidden="true" className="shrink-0 text-convive-oscuro" />
                  <span className="flex-1">{a.texto}</span>
                  {a.insignia && <span className="rounded-full bg-naranja px-2 py-0.5 text-xs font-bold whitespace-nowrap text-texto">{a.insignia}</span>}
                  <ChevronRight size={20} aria-hidden="true" className="shrink-0 text-convive-oscuro" />
                </Link>
              </li>
            );
          })}
        </ul>
        {pronto.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-bold tracking-wide text-texto-suave uppercase">Próximamente</p>
            <ul className="flex flex-wrap gap-1.5">
              {pronto.map((a) => {
                const I = ICONOS[a.icono];
                return (
                  <li key={a.texto} className="flex min-h-9 items-center gap-1.5 rounded-full border border-dashed border-borde px-3 py-1 text-sm whitespace-nowrap text-texto-suave">
                    <I size={16} aria-hidden="true" className="shrink-0" />
                    {a.texto}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
