import Link from "next/link";
import { Building2, ChevronRight, House } from "lucide-react";
import { PantallaIngreso } from "@/app/login/pantalla-ingreso";

// PILOTO-001: elegir qué cuenta crear. El tipo de cuenta lo decide el camino, nunca un campo.
export default function CrearCuentaPage() {
  const opciones = [
    {
      href: "/crear-cuenta/administracion",
      icono: Building2,
      titulo: "Soy administrador/a",
      texto: "Administro comunidades. Necesitas el código de acceso que te entregó Convive.",
    },
    {
      href: "/crear-cuenta/residente",
      icono: House,
      titulo: "Soy residente o propietario/a",
      texto: "Quiero ver mis gastos comunes, pagar e informarme de mi comunidad.",
    },
  ];
  return (
    <PantallaIngreso
      titulo="Crear cuenta"
      descripcion="Elige el tipo de cuenta que necesitas."
      pie={[
        { texto: "¿Ya tienes cuenta?", enlace: "Ingreso de residentes", href: "/login/residentes" },
        { texto: "¿Administras comunidades?", enlace: "Ingreso de administración", href: "/login" },
      ]}
    >
      <ul className="space-y-3">
        {opciones.map((o) => (
          <li key={o.href}>
            <Link
              href={o.href}
              className="flex min-h-20 items-center gap-4 rounded-2xl border border-borde bg-white p-4 transition hover:border-convive hover:bg-convive-suave focus-visible:ring-2 focus-visible:ring-convive"
            >
              <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-convive-suave text-convive-oscuro">
                <o.icono size={24} />
              </span>
              <span className="flex-1">
                <span className="block font-bold text-convive-oscuro">{o.titulo}</span>
                <span className="block text-sm text-texto-suave">{o.texto}</span>
              </span>
              <ChevronRight size={20} aria-hidden="true" className="text-texto-suave" />
            </Link>
          </li>
        ))}
      </ul>
    </PantallaIngreso>
  );
}
