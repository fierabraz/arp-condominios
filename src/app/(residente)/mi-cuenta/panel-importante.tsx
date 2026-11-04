import Link from "next/link";
import { AlertTriangle, CalendarClock, ChevronRight, CircleCheck, Megaphone, Vote, Wallet } from "lucide-react";
import type { Alerta, IconoAlerta, NivelAlerta } from "@/lib/alertas-residente";

const ICONOS: Record<IconoAlerta, typeof Wallet> = {
  deuda: Wallet,
  vencimiento: CalendarClock,
  votacion: Vote,
  aviso: Megaphone,
};

// Cada nivel se distingue por texto, color y borde: no solo por el color.
const NIVELES: Record<NivelAlerta, { texto: string; fila: string; etiqueta: string; icono: string }> = {
  urgente: {
    texto: "Urgente",
    fila: "border-l-4 border-peligro bg-white",
    etiqueta: "bg-peligro-suave text-peligro",
    icono: "text-peligro",
  },
  importante: {
    texto: "Importante",
    fila: "border-l-4 border-naranja bg-white",
    etiqueta: "bg-naranja-suave text-naranja-texto",
    icono: "text-naranja-texto",
  },
  informativo: {
    texto: "Informativo",
    fila: "border-l-4 border-convive bg-white/80",
    etiqueta: "bg-convive-suave text-convive-oscuro",
    icono: "text-convive-oscuro",
  },
};

/** Panel naranja con lo que el residente debe saber: deudas, vencimientos, votaciones y avisos. */
export function PanelImportante({ alertas }: { alertas: Alerta[] }) {
  return (
    <section
      id="importante"
      aria-labelledby="titulo-importante"
      className="scroll-mt-24 overflow-hidden rounded-3xl border border-naranja/40 bg-naranja-suave shadow-sm"
    >
      <h2 id="titulo-importante" className="flex items-center gap-2 bg-naranja px-5 py-4 text-xl font-bold text-texto">
        <AlertTriangle size={24} aria-hidden="true" /> Información importante
      </h2>
      {alertas.length === 0 ? (
        <p className="flex items-center gap-3 px-5 py-6 text-texto">
          <CircleCheck size={24} aria-hidden="true" className="shrink-0 text-exito" />
          No tienes avisos importantes. Todo está en orden.
        </p>
      ) : (
        <ul className="space-y-2 p-3">
          {alertas.map((a) => {
            const n = NIVELES[a.nivel];
            const Icono = ICONOS[a.icono];
            return (
              <li key={a.id}>
                <Link
                  href={a.href}
                  className={`flex min-h-16 items-center gap-3 rounded-2xl px-4 py-3 shadow-xs hover:shadow-md focus-visible:ring-2 focus-visible:ring-naranja-texto ${n.fila}`}
                >
                  <Icono size={24} aria-hidden="true" className={`shrink-0 ${n.icono}`} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-texto">{a.titulo}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${n.etiqueta}`}>{n.texto}</span>
                    </span>
                    <span className="mt-0.5 block text-sm text-texto-suave">{a.detalle}</span>
                  </span>
                  <ChevronRight size={20} aria-hidden="true" className="shrink-0 text-texto-suave" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
