"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { MessageCircleQuestion, SendHorizontal, Sparkles, X } from "lucide-react";
import { preguntarAsistente } from "@/app/asistente/actions";

// IA-002 · Botón flotante "Ayuda" y ventana de conversación con el asistente.
// La conversación vive solo en esta pestaña: no se guarda en la base de datos.

type Mensaje = { rol: "usuario" | "asistente"; texto: string; error?: boolean };

const SUGERENCIAS = {
  ADMINISTRADOR: [
    "¿Cómo emito los gastos comunes del mes?",
    "¿Qué unidades tienen deuda vencida?",
    "¿Cómo registro un pago?",
  ],
  COMITE: ["¿Cuánto se recaudó el último mes?", "¿Qué unidades tienen deuda vencida?", "¿Dónde veo la rendición mensual?"],
  RESIDENTE: ["¿Cuánto debo y cuándo vence?", "¿Cómo reservo el quincho?", "¿Dónde descargo mi aviso de cobro?"],
} as const;

export type PerfilAyuda = keyof typeof SUGERENCIAS;

export function Asistente({ perfil, nombre }: { perfil: PerfilAyuda; nombre: string }) {
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState("");
  const [restantes, setRestantes] = useState<number | null>(null);
  const [pendiente, iniciar] = useTransition();
  const ruta = usePathname();
  const entrada = useRef<HTMLTextAreaElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (abierto) entrada.current?.focus();
  }, [abierto]);
  useEffect(() => {
    lista.current?.scrollTo({ top: lista.current.scrollHeight, behavior: "smooth" });
  }, [mensajes, pendiente]);

  function cerrar() {
    setAbierto(false);
    boton.current?.focus();
  }

  function enviar(pregunta: string) {
    const limpia = pregunta.trim();
    if (!limpia || pendiente) return;
    // Solo se reenvían las respuestas reales, no los avisos de error.
    const historial = mensajes.filter((m) => !m.error).map(({ rol, texto }) => ({ rol, texto }));
    setMensajes((ms) => [...ms, { rol: "usuario", texto: limpia }]);
    setTexto("");
    iniciar(async () => {
      try {
        const r = await preguntarAsistente({ pregunta: limpia, historial, ruta });
        if (r.ok) {
          setMensajes((ms) => [...ms, { rol: "asistente", texto: r.texto }]);
          setRestantes(r.restantes);
        } else {
          setMensajes((ms) => [...ms, { rol: "asistente", texto: r.error, error: true }]);
        }
      } catch {
        setMensajes((ms) => [...ms, { rol: "asistente", texto: "No se pudo conectar. Revisa tu conexión e intenta de nuevo.", error: true }]);
      }
    });
  }

  const abajo = perfil === "RESIDENTE" ? "bottom-24 lg:bottom-6" : "bottom-4 md:bottom-6";

  return (
    <>
      {!abierto && (
        <button
          ref={boton}
          type="button"
          onClick={() => setAbierto(true)}
          className={`fixed right-4 ${abajo} z-30 flex min-h-12 items-center gap-2 rounded-full bg-convive-oscuro px-4 font-semibold text-white shadow-lg hover:bg-convive-oscuro/90 focus-visible:ring-4 focus-visible:ring-convive/50 md:right-6`}
        >
          <MessageCircleQuestion size={22} aria-hidden="true" />
          Ayuda
        </button>
      )}
      {abierto && (
        <section
          role="dialog"
          aria-label="Asistente de ayuda"
          onKeyDown={(e) => e.key === "Escape" && cerrar()}
          className="fixed inset-0 z-50 flex flex-col bg-white md:inset-auto md:right-6 md:bottom-6 md:h-[min(40rem,calc(100vh-3rem))] md:w-[26rem] md:rounded-3xl md:border md:border-borde md:shadow-2xl"
        >
          <header className="flex items-center gap-3 border-b border-borde px-4 py-3">
            <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full bg-convive-suave text-convive-oscuro">
              <Sparkles size={19} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-bold text-convive-oscuro">Asistente Convive</h2>
              <p className="text-xs text-texto-suave">Responde con inteligencia artificial. Puede equivocarse.</p>
            </div>
            <button
              type="button"
              onClick={cerrar}
              aria-label="Cerrar asistente"
              className="inline-flex size-11 items-center justify-center rounded-xl text-texto hover:bg-fondo"
            >
              <X size={22} aria-hidden="true" />
            </button>
          </header>

          <div ref={lista} aria-live="polite" className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {mensajes.length === 0 && (
              <div className="space-y-3">
                <p className="rounded-2xl bg-convive-suave/70 px-4 py-3 text-sm">
                  Hola, {nombre.split(" ")[0]}. Puedo explicarte cómo usar Convive y consultar
                  {perfil === "RESIDENTE" ? " tu estado de cuenta y las novedades de tu comunidad." : " los datos de las comunidades que puedes ver."}{" "}
                  Solo miro: no hago pagos ni cambios.
                </p>
                <p className="text-xs font-bold tracking-wide text-texto-suave uppercase">Puedes preguntar, por ejemplo</p>
                <ul className="space-y-2">
                  {SUGERENCIAS[perfil].map((s) => (
                    <li key={s}>
                      <button
                        type="button"
                        onClick={() => enviar(s)}
                        className="w-full rounded-2xl border border-borde px-4 py-2.5 text-left text-sm font-medium hover:border-convive hover:bg-convive-suave/50"
                      >
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {mensajes.map((m, i) => (
              <div key={i} className={m.rol === "usuario" ? "flex justify-end" : "flex justify-start"}>
                <p
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                    m.rol === "usuario"
                      ? "bg-convive-oscuro text-white"
                      : m.error
                        ? "bg-naranja-suave text-naranja-texto"
                        : "bg-fondo text-texto"
                  }`}
                >
                  <span className="sr-only">{m.rol === "usuario" ? "Tú: " : "Asistente: "}</span>
                  {m.texto}
                </p>
              </div>
            ))}
            {pendiente && (
              <p className="flex items-center gap-2 text-sm text-texto-suave">
                <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-convive" />
                Buscando la respuesta…
              </p>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              enviar(texto);
            }}
            className="border-t border-borde px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          >
            <div className="flex items-end gap-2">
              <label htmlFor="pregunta-asistente" className="sr-only">
                Tu pregunta
              </label>
              <textarea
                id="pregunta-asistente"
                ref={entrada}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    enviar(texto);
                  }
                }}
                rows={2}
                maxLength={1000}
                placeholder="Escribe tu pregunta…"
                className="min-h-12 flex-1 resize-none rounded-2xl border border-borde px-3 py-2 text-sm focus:border-convive focus:outline-none"
              />
              <button
                type="submit"
                disabled={pendiente || !texto.trim()}
                aria-label="Enviar pregunta"
                className="inline-flex size-12 shrink-0 items-center justify-center rounded-2xl bg-convive-oscuro text-white disabled:opacity-40"
              >
                <SendHorizontal size={20} aria-hidden="true" />
              </button>
            </div>
            <p className="mt-2 text-xs text-texto-suave">
              No escribas claves ni datos bancarios.
              {restantes !== null && ` Te quedan ${restantes} pregunta${restantes === 1 ? "" : "s"} hoy.`}
            </p>
          </form>
        </section>
      )}
    </>
  );
}
