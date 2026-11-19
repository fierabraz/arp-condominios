"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";
import { Boton, Campo, Input, Mensaje, Select } from "@/components/ui";
import type { EstadoForm } from "@/lib/forms";
import { ORDEN_RELACIONES, RELACIONES, type RelacionDeclarada } from "@/lib/cuentas-reglas";

type Accion = (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>;
type Opcion = { id: string; texto: string };

export function AprobarForm({
  accion,
  unidades,
  unidadSugerida,
  fichas,
  fichaFija,
  relacion,
}: {
  accion: Accion;
  unidades: Opcion[];
  unidadSugerida: string | null;
  fichas: (Opcion & { motivo: string })[];
  fichaFija: Opcion | null;
  relacion: RelacionDeclarada;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  if (estado.ok) return <Mensaje texto={estado.mensaje} tipo="ok" />;
  return (
    <form action={enviar} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Unidad">
          <Select name="unidadId" defaultValue={unidadSugerida ?? ""} required>
            <option value="" disabled>
              Elige la unidad…
            </option>
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>
                {u.texto}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo etiqueta="Relación con la unidad">
          <Select name="relacion" defaultValue={relacion}>
            {ORDEN_RELACIONES.map((r) => (
              <option key={r} value={r}>
                {RELACIONES[r].texto}
              </option>
            ))}
          </Select>
        </Campo>
      </div>
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-semibold">Ficha de la persona</legend>
        {fichaFija ? (
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="radio" name="personaId" value={fichaFija.id} defaultChecked /> {fichaFija.texto} (su cuenta ya está unida a esta ficha)
          </label>
        ) : (
          <>
            {fichas.map((f, i) => (
              <label key={f.id} className="flex min-h-11 items-center gap-2 text-sm">
                <input type="radio" name="personaId" value={f.id} defaultChecked={i === 0} required />
                <span>
                  <strong>{f.texto}</strong> <span className="text-texto-suave">· {f.motivo}</span>
                </span>
              </label>
            ))}
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="radio" name="personaId" value="NUEVA" defaultChecked={fichas.length === 0} required />
              <span>Crear una ficha nueva con sus datos</span>
            </label>
          </>
        )}
      </fieldset>
      <Mensaje texto={estado.mensaje} />
      <Boton type="submit" disabled={pendiente}>
        <Check size={16} aria-hidden="true" />
        {pendiente ? "Aprobando…" : "Aprobar y dar acceso"}
      </Boton>
    </form>
  );
}

export function RechazarForm({ accion }: { accion: Accion }) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  const [abierto, setAbierto] = useState(false);
  if (estado.ok) return <Mensaje texto={estado.mensaje} tipo="ok" />;
  if (!abierto) {
    return (
      <Boton type="button" variante="peligro" onClick={() => setAbierto(true)}>
        Rechazar
      </Boton>
    );
  }
  return (
    <form action={enviar} className="space-y-2">
      <Campo etiqueta="Motivo (la persona lo verá)">
        <Input name="motivo" required minLength={5} maxLength={300} placeholder="Ej. No figura como propietaria ni arrendataria de esa unidad" />
      </Campo>
      <Mensaje texto={estado.mensaje} />
      <div className="flex gap-2">
        <Boton type="submit" variante="peligro" disabled={pendiente}>
          {pendiente ? "Rechazando…" : "Confirmar rechazo"}
        </Boton>
        <Boton type="button" variante="secundario" onClick={() => setAbierto(false)}>
          Volver
        </Boton>
      </div>
    </form>
  );
}

/** Enlace de confirmación de correo, para cuando el correo no llega (sin servicio de correo). */
export function EnlaceConfirmacion({
  generar,
}: {
  generar: () => Promise<{ enlace: string; telefono: string | null; nombre: string } | null>;
}) {
  const [r, setR] = useState<{ enlace: string; telefono: string | null; nombre: string } | null>(null);
  const [error, setError] = useState<string>();
  const [pendiente, iniciar] = useTransition();
  if (!r) {
    return (
      <div className="space-y-1">
        <Boton
          type="button"
          variante="secundario"
          disabled={pendiente}
          onClick={() =>
            iniciar(async () => {
              const x = await generar();
              if (x) setR(x);
              else setError("No se pudo generar el enlace.");
            })
          }
        >
          {pendiente ? "Generando…" : "Obtener su enlace de confirmación"}
        </Boton>
        <Mensaje texto={error} />
      </div>
    );
  }
  const mensaje = `Hola, ${r.nombre.split(" ")[0]}. Confirma tu correo en Convive con este enlace: ${r.enlace}`;
  const numero = (r.telefono ?? "").replace(/\D/g, "");
  return (
    <div className="space-y-2 rounded-xl border border-marca-suave bg-marca-suave/40 p-3 text-sm">
      <p>Envíaselo solo a esa persona (por ejemplo, por WhatsApp a su número). Sirve una vez y por 48 horas.</p>
      <input readOnly value={r.enlace} aria-label="Enlace de confirmación" className="min-h-10 w-full rounded-lg border border-borde bg-white px-2 font-mono text-xs" />
      <a
        href={`https://wa.me/${numero.length === 9 ? `56${numero}` : numero}?text=${encodeURIComponent(mensaje)}`}
        target="_blank"
        rel="noopener"
        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1f9d55] px-4 text-sm font-semibold text-white"
      >
        <MessageCircle size={16} aria-hidden="true" /> Enviar por WhatsApp
      </a>
    </div>
  );
}

export function CopiarTexto({ texto, etiqueta }: { texto: string; etiqueta: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <Boton
      type="button"
      variante="secundario"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2500);
        } catch {
          // Sin portapapeles: el texto está a la vista para copiarlo a mano.
        }
      }}
    >
      {copiado ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
      {copiado ? "Copiado" : etiqueta}
    </Boton>
  );
}
