"use client";

// PAG-001 · Formularios de «Datos para transferir».

import { useActionState, useState, useTransition } from "react";
import { Boton, Campo, Input, Mensaje, Select } from "@/components/ui";
import type { EstadoForm } from "@/lib/forms";
import { BANCOS, TIPOS_CUENTA } from "@/lib/cartolas";

type Accion = (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>;

export type CuentaInicial = {
  banco: string;
  tipo: string;
  numeroFinal: string;
  numeroCuenta: string | null;
  titular: string | null;
  rutTitular: string | null;
  correoPagos: string | null;
  recibePagos: boolean;
};

/** Crear la cuenta (sin `cuenta`) o completar los datos de una ya registrada para cartolas. */
export function FormularioDatosPago({ accion, cuenta, sugerencia }: { accion: Accion; cuenta?: CuentaInicial; sugerencia?: { titular: string; rut: string } }) {
  // Se llama a la acción a mano (no con <form action>) para que, si hay que corregir algo, el
  // formulario no se borre.
  const [estado, setEstado] = useState<EstadoForm>({});
  const [pendiente, iniciar] = useTransition();
  const v: Record<string, string> = {};
  const [banco, setBanco] = useState("");
  const e = estado.errores ?? {};
  return (
    <form
      onSubmit={(ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.currentTarget);
        iniciar(async () => setEstado(await accion(estado, fd)));
      }}
      className="grid gap-4 sm:grid-cols-2"
    >
      {!cuenta && (
        <>
          <Campo etiqueta="Banco" error={e.banco}>
            <Select name="banco" defaultValue="" onChange={(x) => setBanco(x.target.value)} required>
              <option value="">Elige el banco</option>
              {BANCOS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </Select>
          </Campo>
          {banco === "Otro" ? (
            <Campo etiqueta="Nombre del banco">
              <Input name="bancoOtro" defaultValue={v.bancoOtro ?? ""} maxLength={60} required />
            </Campo>
          ) : (
            <span className="hidden sm:block" />
          )}
        </>
      )}
      <Campo etiqueta="Tipo de cuenta" error={e.tipo}>
        <Select name="tipo" defaultValue={v.tipo ?? cuenta?.tipo ?? "CORRIENTE"}>
          {Object.entries(TIPOS_CUENTA).map(([k, t]) => (
            <option key={k} value={k}>
              {t}
            </option>
          ))}
        </Select>
      </Campo>
      <Campo etiqueta={cuenta ? `Número de cuenta completo (termina en ${cuenta.numeroFinal})` : "Número de cuenta completo"} error={e.numeroCuenta}>
        <Input name="numeroCuenta" inputMode="numeric" maxLength={30} defaultValue={v.numeroCuenta ?? cuenta?.numeroCuenta ?? ""} required />
      </Campo>
      <Campo etiqueta="Titular de la cuenta" error={e.titular}>
        <Input name="titular" maxLength={100} defaultValue={v.titular ?? cuenta?.titular ?? sugerencia?.titular ?? ""} placeholder="Ej. Comunidad Edificio Los Aromos" required />
      </Campo>
      <Campo etiqueta="RUT del titular" error={e.rutTitular}>
        <Input name="rutTitular" maxLength={14} defaultValue={v.rutTitular ?? cuenta?.rutTitular ?? sugerencia?.rut ?? ""} placeholder="12.345.678-9" required />
      </Campo>
      <Campo etiqueta="Correo para enviar comprobantes (opcional)" error={e.correoPagos}>
        <Input name="correoPagos" type="email" maxLength={120} defaultValue={v.correoPagos ?? cuenta?.correoPagos ?? ""} />
      </Campo>
      <label className="flex min-h-11 items-center gap-2 self-end text-sm font-semibold">
        <input type="checkbox" name="recibePagos" defaultChecked={v.recibePagos ? v.recibePagos === "on" : (cuenta?.recibePagos ?? true)} className="h-5 w-5" />
        Usar esta cuenta para los pagos de los residentes
      </label>
      <p className="text-xs text-texto-suave sm:col-span-2">
        Son los datos que la comunidad entrega para que le transfieran. Convive nunca pide ni guarda claves bancarias. Al
        cambiar cualquier dato hay que volver a verificarlos.
      </p>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Boton type="submit" disabled={pendiente}>
          {pendiente ? "Guardando…" : cuenta ? "Guardar datos" : "Registrar cuenta"}
        </Boton>
        <Mensaje texto={estado.mensaje} tipo={estado.ok ? "ok" : "error"} />
      </div>
    </form>
  );
}

/** Confirmar que los datos se compararon con el banco y publicarlos. */
export function FormularioVerificar({ accion }: { accion: Accion }) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  return (
    <form action={enviar} className="space-y-3">
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="revisado" className="mt-0.5 h-5 w-5 shrink-0" required />
        Comparé estos datos con el certificado de la cuenta o la cartola del banco y son correctos.
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Boton type="submit" disabled={pendiente}>
          {pendiente ? "Publicando…" : "Marcar como verificada y publicar"}
        </Boton>
        <Mensaje texto={estado.mensaje} />
      </div>
    </form>
  );
}

export function BotonDespublicar({ accion }: { accion: () => Promise<EstadoForm> }) {
  const [pendiente, iniciar] = useTransition();
  const [mensaje, setMensaje] = useState<string>();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Boton
        type="button"
        variante="peligro"
        disabled={pendiente}
        onClick={() => {
          if (!confirm("Los residentes dejarán de ver los datos para transferir. ¿Continuar?")) return;
          iniciar(async () => {
            const r = await accion();
            setMensaje(r?.ok ? undefined : r?.mensaje);
          });
        }}
      >
        Quitar publicación
      </Boton>
      <Mensaje texto={mensaje} />
    </span>
  );
}
