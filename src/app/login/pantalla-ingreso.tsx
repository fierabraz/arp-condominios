import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/logo";
import { Mensaje } from "@/components/ui";

/** Marco común de las pantallas de ingreso, recuperación y nueva contraseña. */
export function PantallaIngreso({
  titulo,
  descripcion,
  aviso,
  children,
  pie,
}: {
  titulo: string;
  descripcion?: string;
  aviso?: string;
  children: ReactNode;
  pie?: { texto: string; enlace: string; href: string }[];
}) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-borde bg-white p-8 shadow-sm">
          <Logo tamano="lg" />
          <h1 className="mt-6 text-xl font-bold">{titulo}</h1>
          {descripcion && <p className="mt-1 text-sm text-texto-suave">{descripcion}</p>}
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
    </main>
  );
}
