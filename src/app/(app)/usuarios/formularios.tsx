"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, Copy, Mail, Send } from "lucide-react";
import { Boton, Campo, Input, Mensaje } from "@/components/ui";
import type { EstadoForm } from "@/lib/forms";
import type { EstadoInvitacion } from "./actions";
import { CamposPerfil } from "./campos-perfil";

type Opcion = { id: string; nombre: string };

function EnlaceCopiable({ enlace, texto }: { enlace: string; texto: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="space-y-2 rounded-xl border border-marca-suave bg-marca-suave/40 p-3 text-sm">
      <p className="flex items-start gap-2">
        <Mail size={16} className="mt-0.5 shrink-0 text-marca" aria-hidden="true" />
        <span>{texto}</span>
      </p>
      <input
        readOnly
        value={enlace}
        aria-label="Enlace de invitación"
        onFocus={(e) => e.currentTarget.select()}
        className="min-h-10 w-full rounded-lg border border-borde bg-white px-2 font-mono text-xs"
      />
      <Boton
        type="button"
        variante="secundario"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(enlace);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2500);
          } catch {
            // Sin portapapeles: el enlace está a la vista.
          }
        }}
      >
        {copiado ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
        {copiado ? "Copiado" : "Copiar enlace"}
      </Boton>
    </div>
  );
}

type AccionInvitar = (estado: EstadoInvitacion, formData: FormData) => Promise<EstadoInvitacion>;

export function InvitarEquipoForm({ accion, condominios }: { accion: AccionInvitar; condominios: Opcion[] }) {
  // Al cambiar la clave se vuelve a montar el formulario, vacío, para invitar a otra persona.
  const [clave, setClave] = useState(0);
  return <InvitarUno key={clave} accion={accion} condominios={condominios} otra={() => setClave((c) => c + 1)} />;
}

function InvitarUno({ accion, condominios, otra }: { accion: AccionInvitar; condominios: Opcion[]; otra: () => void }) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  if (estado.ok && estado.invitacion) {
    const r = estado.invitacion;
    return (
      <div className="space-y-3">
        <Mensaje tipo="ok" texto={`Invitación creada para ${r.nombre}.`} />
        <EnlaceCopiable
          enlace={r.enlace}
          texto={
            r.correoEstado === "ENVIADO"
              ? `Le enviamos la invitación a ${r.correo}. El enlace sirve una vez y por 7 días; solo la persona invitada debe usarlo.`
              : `El correo no salió (servicio de correo sin configurar o con error). Envíale este enlace solo a ${r.nombre}: con él crea su propia contraseña.`
          }
        />
        <Boton type="button" variante="secundario" onClick={otra}>
          Invitar a otra persona
        </Boton>
      </div>
    );
  }
  const e = estado.errores ?? {};
  return (
    <form action={enviar} className="grid items-start gap-4 sm:grid-cols-2">
      <Campo etiqueta="Nombre" error={e.nombre}>
        <Input name="nombre" required />
      </Campo>
      <Campo etiqueta="Correo" error={e.correo}>
        <Input name="correo" type="email" required />
      </Campo>
      <CamposPerfil condominios={condominios} errores={e} />
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Boton type="submit" disabled={pendiente}>
          <Send size={16} aria-hidden="true" />
          {pendiente ? "Invitando…" : "Enviar invitación"}
        </Boton>
        <Mensaje texto={estado.mensaje} />
      </div>
    </form>
  );
}

export function PerfilForm({
  accion,
  condominios,
  perfil,
  asignados,
  extras,
}: {
  accion: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>;
  condominios: Opcion[];
  perfil: string;
  asignados: string[];
  extras: string[];
}) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  return (
    <details className="text-left">
      <summary className="cursor-pointer list-none text-sm font-semibold text-marca hover:underline">Cambiar perfil o acceso</summary>
      <form action={enviar} className="mt-3 grid gap-3">
        <CamposPerfil condominios={condominios} perfil={perfil} asignados={asignados} extras={extras} incluirAdministrador={perfil === "ADMINISTRADOR"} />
        <div className="flex flex-wrap items-center gap-3">
          <Boton type="submit" disabled={pendiente}>
            {pendiente ? "Guardando…" : "Guardar"}
          </Boton>
          <Mensaje texto={estado.mensaje} tipo={estado.ok ? "ok" : "error"} />
        </div>
      </form>
    </details>
  );
}

export function RenovarInvitacion({ renovar }: { renovar: () => Promise<string | null> }) {
  const [enlace, setEnlace] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  if (enlace) return <EnlaceCopiable enlace={enlace} texto="Enlace nuevo creado (el anterior ya no sirve). Envíaselo solo a esa persona." />;
  return (
    <button
      type="button"
      disabled={pendiente}
      onClick={() => iniciar(async () => setEnlace(await renovar()))}
      className="min-h-11 text-sm font-semibold text-marca hover:underline"
    >
      {pendiente ? "Creando enlace…" : "Enviar invitación nueva"}
    </button>
  );
}
