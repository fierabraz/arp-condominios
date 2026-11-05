"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Mail, MessageCircle, Send } from "lucide-react";
import { Boton, Mensaje } from "@/components/ui";
import type { ResultadoInvitacion } from "@/lib/invitaciones";

type Invitar = () => Promise<ResultadoInvitacion>;

/** El enlace recién creado, con botones para copiarlo o mandarlo por WhatsApp. */
export function EnlaceInvitacion({ r }: { r: Extract<ResultadoInvitacion, { ok: true }> }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(r.mensaje);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Sin permiso para el portapapeles: el enlace queda a la vista para copiarlo a mano.
    }
  };
  return (
    <div className="space-y-2 rounded-xl border border-marca-suave bg-marca-suave/40 p-3 text-sm">
      <p className="flex items-start gap-2">
        <Mail size={16} className="mt-0.5 shrink-0 text-marca" aria-hidden="true" />
        <span>
          {r.correoEstado === "ENVIADO"
            ? `Le enviamos la invitación a ${r.correo}. También puedes mandársela por WhatsApp.`
            : r.correoEstado === "ERROR"
              ? `No se pudo enviar el correo a ${r.correo}. Mándale el enlace por WhatsApp.`
              : "El correo todavía no está configurado: mándale este enlace por WhatsApp."}
        </span>
      </p>
      <input
        readOnly
        value={r.enlace}
        aria-label={`Enlace de invitación de ${r.nombre}`}
        onFocus={(e) => e.currentTarget.select()}
        className="min-h-10 w-full rounded-lg border border-borde bg-white px-2 font-mono text-xs"
      />
      <div className="flex flex-wrap gap-2">
        <a
          href={r.whatsapp}
          target="_blank"
          rel="noopener"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1f9d55] px-4 text-sm font-semibold text-white hover:bg-[#18804a]"
        >
          <MessageCircle size={16} aria-hidden="true" /> Enviar por WhatsApp
        </a>
        <Boton type="button" variante="secundario" onClick={copiar}>
          {copiado ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          {copiado ? "Copiado" : "Copiar mensaje"}
        </Boton>
      </div>
    </div>
  );
}

/** Botón para invitar (o reenviar la invitación) a una persona. */
export function BotonInvitar({ invitar, reenviar = false }: { invitar: Invitar; reenviar?: boolean }) {
  const [resultado, setResultado] = useState<ResultadoInvitacion | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <div className="space-y-2">
      {!resultado?.ok && (
        <Boton
          type="button"
          variante={reenviar ? "secundario" : "primario"}
          disabled={pendiente}
          onClick={() => iniciar(async () => setResultado(await invitar()))}
        >
          <Send size={16} aria-hidden="true" />
          {pendiente ? "Creando enlace…" : reenviar ? "Enviar enlace nuevo" : "Invitar"}
        </Boton>
      )}
      {resultado && (resultado.ok ? <EnlaceInvitacion r={resultado} /> : <Mensaje texto={resultado.error} />)}
    </div>
  );
}

/** Invitar de una vez a todas las personas pendientes de la propiedad. */
export function InvitarTodos({ invitar, cantidad }: { invitar: () => Promise<ResultadoInvitacion[]>; cantidad: number }) {
  const [resultados, setResultados] = useState<ResultadoInvitacion[] | null>(null);
  const [pendiente, iniciar] = useTransition();
  if (resultados) {
    const ok = resultados.filter((r) => r.ok);
    const fallas = resultados.filter((r) => !r.ok);
    return (
      <div className="space-y-4">
        <Mensaje
          tipo={ok.length ? "ok" : "error"}
          texto={`${ok.length} ${ok.length === 1 ? "invitación creada" : "invitaciones creadas"}${fallas.length ? `, ${fallas.length} con problemas` : ""}.`}
        />
        <ul className="space-y-4">
          {resultados.map((r) => (
            <li key={r.personaId}>
              <p className="mb-1 font-semibold">{r.nombre}</p>
              {r.ok ? <EnlaceInvitacion r={r} /> : <Mensaje texto={r.error} />}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <Boton
      type="button"
      disabled={pendiente || cantidad === 0}
      onClick={() => {
        if (confirm(`¿Invitar a ${cantidad} ${cantidad === 1 ? "persona" : "personas"}?`)) {
          iniciar(async () => setResultados(await invitar()));
        }
      }}
    >
      <Send size={16} aria-hidden="true" />
      {pendiente ? "Creando invitaciones…" : `Invitar a los ${cantidad} pendientes`}
    </Boton>
  );
}
