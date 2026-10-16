"use client";

import type { ReactNode } from "react";

/** Botón dentro de un formulario que pide confirmación antes de ejecutar la acción. */
export function BotonConfirmar({
  accion,
  pregunta,
  className,
  children,
}: {
  accion: () => Promise<void>;
  pregunta: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <form
      action={accion}
      onSubmit={(ev) => {
        if (!confirm(pregunta)) ev.preventDefault();
      }}
    >
      <button className={className}>{children}</button>
    </form>
  );
}
