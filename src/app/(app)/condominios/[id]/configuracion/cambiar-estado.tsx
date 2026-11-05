"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Boton, Mensaje } from "@/components/ui";
import type { EstadoForm } from "@/lib/forms";
import type { Estado } from "@/lib/configuracion";

/** Botón que pide confirmación y cambia el estado de la propiedad. */
export function CambiarEstado({
  accion,
  destino,
  texto,
  pregunta,
  variante = "primario",
}: {
  accion: (destino: Estado) => Promise<EstadoForm>;
  destino: Estado;
  texto: string;
  pregunta: string;
  variante?: "primario" | "secundario";
}) {
  const [pendiente, iniciar] = useTransition();
  const [resultado, setResultado] = useState<EstadoForm>({});
  const router = useRouter();
  return (
    <div className="space-y-2">
      <Boton
        type="button"
        variante={variante}
        disabled={pendiente}
        onClick={() => {
          if (!confirm(pregunta)) return;
          iniciar(async () => {
            const r = await accion(destino);
            // Al cambiar, la página se redibuja con el nuevo estado y muestra la confirmación.
            if (r.ok) router.replace("?cambiado=1", { scroll: false });
            else setResultado(r);
          });
        }}
      >
        {pendiente ? "Guardando…" : texto}
      </Boton>
      <Mensaje texto={resultado.mensaje} tipo={resultado.ok ? "ok" : "error"} />
    </div>
  );
}
