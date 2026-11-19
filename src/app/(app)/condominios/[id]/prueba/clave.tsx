"use client";

import { useState, useTransition } from "react";
import { Boton } from "@/components/ui";
import type { EstadoClave } from "@/app/(app)/condominios/prueba-actions";

export function ClaveResidente({ accion }: { accion: () => Promise<EstadoClave> }) {
  const [r, setR] = useState<EstadoClave>();
  const [pendiente, iniciar] = useTransition();
  return (
    <div className="space-y-2">
      <Boton type="button" variante="secundario" disabled={pendiente} onClick={() => iniciar(async () => setR(await accion()))}>
        {pendiente ? "Generando…" : "Generar clave del residente ficticio"}
      </Boton>
      {r?.clave && (
        <p className="rounded-xl bg-fondo p-3 text-sm">
          Correo: <strong className="select-all">{r.correo}</strong>
          <br />
          Clave: <strong className="select-all font-mono">{r.clave}</strong>
          <br />
          <span className="text-texto-suave">Ingresa por «Ingreso de residentes» en una ventana privada. Si la pierdes, genera otra.</span>
        </p>
      )}
      {r?.mensaje && <p className="text-sm text-peligro">{r.mensaje}</p>}
    </div>
  );
}
