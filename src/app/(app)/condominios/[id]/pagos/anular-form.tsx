"use client";

import { useActionState } from "react";
import { Boton, Input, Mensaje } from "@/components/ui";
import type { EstadoForm } from "@/lib/forms";

/** "Anular" abre un pequeño formulario que pide el motivo. El pago no se borra: queda como anulado. */
export function AnularPagoForm({ accion }: { accion: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm> }) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  if (estado.ok) return <span className="text-sm text-texto-suave">Anulado</span>;
  return (
    <details className="group text-left">
      <summary className="cursor-pointer list-none text-right text-sm text-peligro hover:underline">Anular</summary>
      <form action={enviar} className="mt-2 flex min-w-64 flex-col gap-2">
        <label className="text-xs font-semibold text-texto">
          Motivo de la anulación
          <Input name="motivo" required minLength={5} maxLength={300} placeholder="Ej.: transferencia rechazada por el banco" />
        </label>
        {estado.errores?.motivo && <span className="text-xs text-peligro">{estado.errores.motivo.join(" ")}</span>}
        <Mensaje texto={estado.mensaje} />
        <Boton type="submit" variante="peligro" disabled={pendiente}>
          {pendiente ? "Anulando…" : "Confirmar anulación"}
        </Boton>
        <p className="text-xs text-texto-suave">El pago queda en la lista como anulado y su monto vuelve a la deuda de la unidad.</p>
      </form>
    </details>
  );
}
