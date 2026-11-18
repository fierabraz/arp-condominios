"use client";

// PAG-001 · Verificar una transferencia: confirmarla con un movimiento de la cartola, dejarla en
// revisión o rechazarla. Nada se confirma solo.

import { useActionState, useState } from "react";
import { Boton, Campo, Input, Insignia, Mensaje } from "@/components/ui";
import type { EstadoForm } from "@/lib/forms";
import type { EstadoConfirmar } from "@/app/(app)/condominios/transferencias-actions";
import { DistribucionPago, type AvisoParaDistribuir } from "@/components/distribucion-pago";

export type Opcion = {
  id: string;
  fecha: string;
  restante: number;
  monto: number;
  cuenta: string;
  descripcion: string;
  motivos: string[];
  nivel: "fuerte" | "posible";
};

const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;

export function FormularioConfirmar({
  accion,
  opciones,
  montoInformado,
  deudaActual,
  ambigua,
  avisos,
}: {
  accion: (e: EstadoConfirmar, f: FormData) => Promise<EstadoConfirmar>;
  opciones: Opcion[];
  montoInformado: number;
  deudaActual: number;
  ambigua: boolean;
  avisos: AvisoParaDistribuir[];
}) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  // Solo se preselecciona si hay una única coincidencia fuerte; si es ambigua, la persona elige.
  const [elegido, setElegido] = useState<string>(!ambigua && opciones[0]?.nivel === "fuerte" ? opciones[0].id : "");
  const opcion = opciones.find((o) => o.id === elegido);
  const [monto, setMonto] = useState(String(Math.round(montoInformado)));
  const [duplicadoOk, setDuplicadoOk] = useState(false);
  const montoNum = Number(monto.replace(/\D/g, "")) || 0;

  if (estado.ok) return <Mensaje tipo="ok" texto={estado.mensaje} />;
  return (
    <form action={enviar} className="space-y-4">
      {ambigua && opciones.length > 1 && (
        <p className="rounded-xl bg-alerta-suave px-3 py-2 text-sm text-alerta">Hay más de un movimiento posible. Revisa cuál corresponde antes de confirmar.</p>
      )}
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-semibold">Movimiento de la cartola donde aparece</legend>
        {opciones.map((o) => (
          <label key={o.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${elegido === o.id ? "border-marca bg-marca-suave" : "border-borde bg-white"}`}>
            <input
              type="radio"
              name="movimientoId"
              value={o.id}
              checked={elegido === o.id}
              onChange={() => {
                setElegido(o.id);
                setMonto(String(Math.round(Math.min(montoInformado, o.restante))));
              }}
              className="mt-1 h-5 w-5"
            />
            <span className="min-w-0 text-sm">
              <span className="flex flex-wrap items-center gap-2 font-semibold">
                {o.fecha} · {pesos(o.restante)} {o.restante !== o.monto && <span className="font-normal text-texto-suave">(de {pesos(o.monto)})</span>}
                {o.nivel === "fuerte" ? <Insignia tono="marca">Coincidencia fuerte</Insignia> : <Insignia>Posible</Insignia>}
              </span>
              <span className="block truncate text-texto-suave">
                {o.cuenta} · {o.descripcion || "sin descripción"}
              </span>
              <span className="block text-xs text-texto-suave">{o.motivos.join(" · ")}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <Campo etiqueta="Monto a registrar como pago" error={estado.errores?.monto}>
        <Input name="monto" inputMode="numeric" value={monto} onChange={(e) => setMonto(e.target.value)} className="max-w-48" />
      </Campo>
      {opcion && montoNum > opcion.restante && <p className="text-sm text-peligro">El movimiento solo tiene {pesos(opcion.restante)} sin conciliar.</p>}
      {montoNum !== Math.round(montoInformado) && <p className="text-sm text-alerta">El monto es distinto al informado ({pesos(montoInformado)}). Quedará anotado.</p>}
      {montoNum > 0 && <DistribucionPago avisos={avisos} monto={montoNum} />}
      {montoNum > deudaActual && (
        <p className="text-sm text-alerta">
          La unidad debe hoy {pesos(deudaActual)}. Lo que sobre ({pesos(montoNum - deudaActual)}) quedará como saldo a favor, ya verificado.
        </p>
      )}
      {estado.duplicado && (
        <div role="alert" className="rounded-xl border border-alerta/40 bg-alerta-suave p-3 text-sm">
          <p className="mb-2">{estado.duplicado}</p>
          <label className="flex items-center gap-2 font-semibold">
            <input type="checkbox" checked={duplicadoOk} onChange={(e) => setDuplicadoOk(e.target.checked)} className="h-5 w-5" />
            Son pagos distintos: registrar de todas formas
          </label>
        </div>
      )}
      {duplicadoOk && <input type="hidden" name="permitirDuplicado" value="1" />}
      <Mensaje texto={estado.mensaje} />
      <p className="text-xs text-texto-suave">
        Al confirmar se registra UN pago por transferencia en Recaudación, aplicado a los avisos elegidos, y esa parte del movimiento
        queda conciliada. Todo ocurre junto o no ocurre. Si fue un error, se puede reversar el pago con un motivo (queda en el historial).
      </p>
      <Boton type="submit" disabled={pendiente || !elegido || montoNum <= 0 || (!!estado.duplicado && !duplicadoOk)}>
        {pendiente ? "Confirmando…" : "Confirmar pago verificado"}
      </Boton>
    </form>
  );
}

export function FormularioNota({
  accion,
  boton,
  variante,
  ayuda,
}: {
  accion: (e: EstadoForm, f: FormData) => Promise<EstadoForm>;
  boton: string;
  variante: "secundario" | "peligro";
  ayuda: string;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  if (estado.ok) return <Mensaje tipo="ok" texto="Listo. Quedó anotado." />;
  return (
    <form action={enviar} className="space-y-2">
      <Campo etiqueta={ayuda} error={estado.errores?.nota}>
        <textarea
          name="nota"
          rows={2}
          maxLength={500}
          required
          className="w-full rounded-xl border border-borde bg-white px-3 py-2 text-base focus:border-convive focus:outline-none focus:ring-2 focus:ring-convive/25 md:text-sm"
        />
      </Campo>
      <Mensaje texto={estado.mensaje} />
      <Boton type="submit" variante={variante} disabled={pendiente}>
        {pendiente ? "Guardando…" : boton}
      </Boton>
    </form>
  );
}

/** FIN-COMP A: un botón con confirmación para vincular con un pago ya registrado. */
export function BotonAccion({
  accion,
  texto,
  confirmar,
  variante = "secundario",
}: {
  accion: (e: EstadoForm, f: FormData) => Promise<EstadoForm>;
  texto: string;
  confirmar: string;
  variante?: "primario" | "secundario";
}) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  const [seguro, setSeguro] = useState(false);
  if (estado.ok) return <Mensaje tipo="ok" texto={estado.mensaje ?? "Listo."} />;
  return (
    <form action={enviar} className="space-y-2">
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={seguro} onChange={(e) => setSeguro(e.target.checked)} className="mt-0.5 h-5 w-5" />
        <span>{confirmar}</span>
      </label>
      <Mensaje texto={estado.mensaje} />
      <Boton type="submit" variante={variante} disabled={pendiente || !seguro}>
        {pendiente ? "Guardando…" : texto}
      </Boton>
    </form>
  );
}
