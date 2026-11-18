"use client";

// FIN-COMP A · Qué avisos paga un pago. Convive propone lo más antiguo primero, pero la
// administración ve la propuesta y puede cambiarla antes de confirmar. Lo que no se reparte queda
// como saldo a favor. Se envía como campo oculto «distribucion» (JSON) y el servidor lo revisa de nuevo.

import { useMemo, useState } from "react";

export type AvisoParaDistribuir = { id: string; etiqueta: string; saldo: number; vencido: boolean };

const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;

function propuesta(monto: number, avisos: AvisoParaDistribuir[]) {
  let resto = Math.max(0, Math.round(monto));
  const r: Record<string, number> = {};
  for (const a of avisos) {
    const m = Math.min(resto, a.saldo);
    r[a.id] = m;
    resto -= m;
  }
  return r;
}

export function DistribucionPago({ avisos, monto }: { avisos: AvisoParaDistribuir[]; monto: number }) {
  // null = se usa la propuesta (sigue al monto); con valores = la administración la cambió.
  const [elegidas, setElegidas] = useState<Record<string, number> | null>(null);
  const sugerida = useMemo(() => propuesta(monto, avisos), [monto, avisos]);
  const editada = elegidas !== null;
  const lineas = elegidas ?? sugerida;

  if (avisos.length === 0) {
    return (
      <p className="rounded-xl bg-fondo px-3 py-2 text-sm text-texto-suave">
        La unidad no tiene avisos con saldo pendiente: todo el pago quedará como saldo a favor (anticipo).
      </p>
    );
  }
  const repartido = avisos.reduce((s, a) => s + (lineas[a.id] ?? 0), 0);
  const aFavor = Math.round(monto) - repartido;
  const excedeAviso = avisos.some((a) => (lineas[a.id] ?? 0) > a.saldo);
  return (
    <fieldset className="rounded-xl border border-borde bg-white p-3">
      <legend className="px-1 text-sm font-semibold">Qué se paga con este pago</legend>
      <p className="mb-2 text-xs text-texto-suave">
        {editada ? "Distribución elegida por la administración." : "Propuesta: primero lo más antiguo. Puedes cambiar los montos."}
      </p>
      <ul className="space-y-2">
        {avisos.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              <span className="font-semibold">{a.etiqueta}</span>{" "}
              <span className={a.vencido ? "text-peligro" : "text-texto-suave"}>
                · saldo {pesos(a.saldo)}
                {a.vencido ? " vencido" : ""}
              </span>
            </span>
            <input
              aria-label={`Monto a aplicar a ${a.etiqueta}`}
              inputMode="numeric"
              value={String(lineas[a.id] ?? 0)}
              onChange={(e) => {
                setElegidas({ ...lineas, [a.id]: Number(e.target.value.replace(/\D/g, "")) || 0 });
              }}
              className="w-32 rounded-lg border border-borde px-2 py-1 text-right tabular-nums"
            />
          </li>
        ))}
      </ul>
      <p className={`mt-2 text-sm ${aFavor < 0 || excedeAviso ? "font-semibold text-peligro" : ""}`}>
        {excedeAviso
          ? "A un aviso se le asigna más que su saldo."
          : aFavor < 0
            ? `Lo repartido supera el pago en ${pesos(-aFavor)}.`
            : aFavor > 0
              ? `Quedan ${pesos(aFavor)} como saldo a favor (se aplicará al próximo cobro).`
              : "Se reparte el pago completo."}
      </p>
      {editada && (
        <button type="button" onClick={() => setElegidas(null)} className="mt-1 text-sm font-semibold text-marca">
          Volver a la propuesta
        </button>
      )}
      <input
        type="hidden"
        name="distribucion"
        value={JSON.stringify(avisos.map((a) => ({ avisoId: a.id, monto: lineas[a.id] ?? 0 })).filter((l) => l.monto > 0))}
      />
    </fieldset>
  );
}
