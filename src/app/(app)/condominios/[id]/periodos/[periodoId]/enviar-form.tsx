"use client";

import { useActionState } from "react";
import { Boton, Mensaje } from "@/components/ui";
import type { EstadoForm } from "@/lib/forms";

export function EnviarForm({
  accion,
  yaEnviados,
}: {
  accion: (estado: EstadoForm) => Promise<EstadoForm>;
  yaEnviados: number;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  const pregunta =
    yaEnviados > 0
      ? `${yaEnviados} avisos ya se enviaron antes. ¿Enviar de nuevo a todas las unidades?`
      : "¿Enviar los avisos de cobro por correo a los propietarios y residentes?";
  return (
    <form
      action={enviar}
      onSubmit={(ev) => {
        if (!confirm(pregunta)) ev.preventDefault();
      }}
      className="flex flex-col items-end gap-2"
    >
      <Boton type="submit" variante="secundario" disabled={pendiente}>
        {pendiente ? "Enviando…" : yaEnviados > 0 ? "Reenviar por correo" : "Enviar avisos por correo"}
      </Boton>
      <Mensaje texto={estado.mensaje} tipo={estado.ok ? "ok" : "error"} />
    </form>
  );
}
