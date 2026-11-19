"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, Copy } from "lucide-react";
import { Boton, Campo, Input, Mensaje } from "@/components/ui";
import type { EstadoCodigo } from "./actions";

function Copiar({ texto, etiqueta }: { texto: string; etiqueta: string }) {
  const [ok, setOk] = useState(false);
  return (
    <Boton
      type="button"
      variante="secundario"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setOk(true);
          setTimeout(() => setOk(false), 2500);
        } catch {
          // Sin portapapeles: el texto está a la vista.
        }
      }}
    >
      {ok ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
      {ok ? "Copiado" : etiqueta}
    </Boton>
  );
}

export function CodigoForm({ accion }: { accion: (e: EstadoCodigo, f: FormData) => Promise<EstadoCodigo> }) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  const e = estado.errores ?? {};
  return (
    <div className="space-y-4">
      <form action={enviar} className="grid items-start gap-4 sm:grid-cols-2">
        <Campo etiqueta="Para quién es" error={e.etiqueta}>
          <Input name="etiqueta" required placeholder="Ej. Leyla, piloto" />
        </Campo>
        <Campo etiqueta="Solo para este correo (recomendado)" error={e.correo}>
          <Input name="correo" type="email" placeholder="correo de la administradora" />
        </Campo>
        <Campo etiqueta="Días de validez" error={e.dias}>
          <Input name="dias" type="number" min={1} max={60} defaultValue={7} />
        </Campo>
        <Campo etiqueta="Cuentas que puede crear" error={e.usos}>
          <Input name="usos" type="number" min={1} max={20} defaultValue={1} />
        </Campo>
        <div className="sm:col-span-2">
          <Boton type="submit" disabled={pendiente}>
            {pendiente ? "Creando…" : "Crear código de acceso"}
          </Boton>
        </div>
      </form>
      <Mensaje texto={estado.ok ? undefined : estado.mensaje} />
      {estado.ok && estado.codigo && (
        <div className="space-y-2 rounded-xl border border-marca-suave bg-marca-suave/40 p-4 text-sm" role="status">
          <p className="font-bold">Código creado. Cópialo ahora: por seguridad no se vuelve a mostrar.</p>
          <p className="font-mono text-xl font-bold tracking-wider">{estado.codigo}</p>
          <input readOnly value={estado.enlace} aria-label="Enlace de registro" className="min-h-10 w-full rounded-lg border border-borde bg-white px-2 font-mono text-xs" />
          <div className="flex flex-wrap gap-2">
            <Copiar texto={estado.enlace!} etiqueta="Copiar enlace" />
            <Copiar texto={estado.codigo} etiqueta="Copiar código" />
          </div>
          <p className="text-texto-suave">Envíalo solo a la persona indicada (correo o WhatsApp). No lo publiques.</p>
        </div>
      )}
    </div>
  );
}

export function EnlaceVerificacion({ generar }: { generar: () => Promise<string | null> }) {
  const [enlace, setEnlace] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  if (enlace) {
    return (
      <div className="space-y-1">
        <input readOnly value={enlace} aria-label="Enlace de confirmación" className="min-h-10 w-full rounded-lg border border-borde bg-white px-2 font-mono text-xs" />
        <Copiar texto={enlace} etiqueta="Copiar" />
      </div>
    );
  }
  return (
    <button
      type="button"
      disabled={pendiente}
      onClick={() => iniciar(async () => setEnlace(await generar()))}
      className="min-h-11 text-sm font-semibold text-marca hover:underline"
    >
      {pendiente ? "Generando…" : "Obtener enlace de confirmación"}
    </button>
  );
}
