import Link from "next/link";
import type { ReactNode } from "react";
import {
  Banknote,
  CalendarDays,
  ChartColumn,
  FileText,
  Megaphone,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { Logo, LogoCompleto } from "@/components/logo";
import { Mensaje } from "@/components/ui";
import { MARCA } from "@/lib/marca";

type Destacado = { icono: LucideIcon; titulo: string; texto: string };

// Lo que cada público encuentra al entrar, mostrado junto al formulario en el computador.
const DESTACADOS: Record<"administracion" | "residentes", { titulo: string; texto: string; items: Destacado[] }> = {
  administracion: {
    titulo: "Administra tus comunidades en un solo lugar",
    texto: "Gastos comunes, cobranza, rendiciones y comunicación con los residentes.",
    items: [
      { icono: Banknote, titulo: "Cobro de gastos comunes", texto: "Prorrateo, avisos y pagos al día." },
      { icono: ChartColumn, titulo: "Rendiciones y reportes", texto: "Cuentas claras cada mes." },
      { icono: Megaphone, titulo: "Muro y votaciones", texto: "Informa y decide con tu comunidad." },
    ],
  },
  residentes: {
    titulo: "Tu condominio, simple y a la mano",
    texto: "Revisa lo que debes, lo que pagaste y lo que pasa en tu comunidad.",
    items: [
      { icono: FileText, titulo: "Quiero informarme", texto: "Estado de cuenta, rendiciones y avisos." },
      { icono: ShieldCheck, titulo: "Quiero realizar una gestión", texto: "Vota y descarga tus documentos." },
      { icono: CalendarDays, titulo: "Información urgente", texto: "Vencimientos y avisos importantes primero." },
    ],
  },
};

/** Marco común de las pantallas de ingreso, recuperación y nueva contraseña (diseño Convive). */
export function PantallaIngreso({
  titulo,
  descripcion,
  aviso,
  children,
  pie,
  publico = "administracion",
}: {
  titulo: string;
  descripcion?: string;
  aviso?: string;
  children: ReactNode;
  pie?: { texto: string; enlace: string; href: string }[];
  publico?: "administracion" | "residentes";
}) {
  const d = DESTACADOS[publico];
  return (
    <main className="fondo-convive flex min-h-screen items-center justify-center p-4 md:p-8">
      <div className="grid w-full max-w-5xl items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
        <section aria-label={`Bienvenida a ${MARCA.nombre}`} className="hidden lg:block">
          <LogoCompleto className="h-28" />
          <h2 className="mt-8 max-w-md text-4xl leading-tight font-bold tracking-tight text-convive-oscuro">{d.titulo}</h2>
          <p className="mt-3 max-w-md text-lg text-texto-suave">{d.texto}</p>
          <ul className="mt-8 grid max-w-md gap-3">
            {d.items.map((it, i) => (
              <li
                key={it.titulo}
                className={`sombra-convive flex items-center gap-4 rounded-2xl border p-4 ${
                  i === d.items.length - 1 && publico === "residentes"
                    ? "border-naranja/40 bg-naranja-suave"
                    : "border-borde bg-white/90"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${
                    i === d.items.length - 1 && publico === "residentes" ? "bg-naranja text-white" : "bg-convive-suave text-convive-oscuro"
                  }`}
                >
                  <it.icono size={24} />
                </span>
                <span>
                  <span className="block font-bold text-convive-oscuro">{it.titulo}</span>
                  <span className="block text-sm text-texto-suave">{it.texto}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <div className="mx-auto w-full max-w-md">
          <div className="sombra-convive rounded-3xl border border-borde bg-white p-6 sm:p-8">
            <div className="lg:hidden">
              <Logo tamano="lg" />
            </div>
            <h1 className="mt-6 text-2xl font-bold tracking-tight text-convive-oscuro lg:mt-0">{titulo}</h1>
            {descripcion && <p className="mt-1 text-texto-suave">{descripcion}</p>}
            {aviso && (
              <div className="mt-4">
                <Mensaje texto={aviso} tipo="ok" />
              </div>
            )}
            <div className="mt-6">{children}</div>
          </div>
          {pie && (
            <div className="mt-4 space-y-1 text-center text-sm text-texto-suave">
              {pie.map((p) => (
                <p key={p.href}>
                  {p.texto}{" "}
                  <Link href={p.href} className="inline-flex min-h-11 items-center font-semibold text-marca hover:text-marca-oscuro">
                    {p.enlace}
                  </Link>
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
