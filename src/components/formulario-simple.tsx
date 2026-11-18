"use client";

// Formulario de una acción con campos simples: muestra el mensaje de error o de éxito.
// Los campos llegan como children (pueden venir de un componente de servidor).

import { useActionState, type ReactNode } from "react";
import { Boton, Mensaje } from "@/components/ui";
import type { EstadoForm } from "@/lib/forms";

export function FormularioSimple({
  accion,
  boton,
  children,
  variante = "secundario",
  multipart = false,
}: {
  accion: (e: EstadoForm, f: FormData) => Promise<EstadoForm>;
  boton: string;
  children?: ReactNode;
  variante?: "primario" | "secundario" | "peligro";
  multipart?: boolean;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  const errores = Object.values(estado.errores ?? {}).flat().filter(Boolean) as string[];
  return (
    <form action={enviar} className="space-y-3" {...(multipart ? { encType: "multipart/form-data" } : {})}>
      {children}
      <Mensaje texto={estado.ok ? estado.mensaje : [estado.mensaje, ...errores].filter(Boolean).join(" ") || undefined} tipo={estado.ok ? "ok" : "error"} />
      <Boton type="submit" variante={variante} disabled={pendiente}>
        {pendiente ? "Guardando…" : boton}
      </Boton>
    </form>
  );
}
