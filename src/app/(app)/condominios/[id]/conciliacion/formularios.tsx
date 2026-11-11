"use client";

// FIN-003.1 · Formularios de Conciliación bancaria: elegir comunidad y cuenta, registrar cuentas,
// editar perfiles de cartola y marcar movimientos para revisión.

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Boton, Campo, Input, Mensaje, Select, Tabla } from "@/components/ui";
import type { EstadoForm } from "@/lib/forms";
import { BANCOS, CAMPOS_CARTOLA, TEXTO_FORMATO_FECHA, TEXTO_SEPARADOR, TEXTO_SIGNO, TIPOS_CUENTA } from "@/lib/cartolas";

type Accion = (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>;

/** Cambiar de comunidad sin salir de Conciliación bancaria. */
export function ElegirComunidad({ actual, comunidades }: { actual: string; comunidades: { id: string; nombre: string }[] }) {
  const router = useRouter();
  if (comunidades.length < 2) return null;
  return (
    <label className="block max-w-sm text-sm">
      <span className="mb-1 block font-semibold">Comunidad</span>
      <Select value={actual} onChange={(e) => router.push(`/condominios/${e.target.value}/conciliacion`)}>
        {comunidades.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </Select>
    </label>
  );
}

/** Registrar una cuenta bancaria: banco, tipo y solo los últimos 4 dígitos. */
export function FormularioCuenta({ accion, sugerida }: { accion: Accion; sugerida?: { banco: string; tipo: string; numeroFinal: string } }) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  const v = estado.valores ?? {};
  const bancoInicial = v.banco ?? (sugerida ? (BANCOS.includes(sugerida.banco) ? sugerida.banco : "Otro") : "");
  const [banco, setBanco] = useState(bancoInicial);
  return (
    <form action={enviar} className="grid gap-4 sm:grid-cols-2">
      <Campo etiqueta="Banco" error={estado.errores?.banco}>
        <Select name="banco" value={banco} onChange={(e) => setBanco(e.target.value)} required>
          <option value="">Elige el banco</option>
          {BANCOS.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </Select>
      </Campo>
      {banco === "Otro" && (
        <Campo etiqueta="Nombre del banco">
          <Input name="bancoOtro" defaultValue={v.bancoOtro ?? (sugerida && !BANCOS.includes(sugerida.banco) ? sugerida.banco : "")} maxLength={60} required />
        </Campo>
      )}
      <Campo etiqueta="Tipo de cuenta" error={estado.errores?.tipo}>
        <Select name="tipo" defaultValue={v.tipo ?? sugerida?.tipo ?? "CORRIENTE"}>
          {Object.entries(TIPOS_CUENTA).map(([k, t]) => (
            <option key={k} value={k}>
              {t}
            </option>
          ))}
        </Select>
      </Campo>
      <Campo etiqueta="Últimos 4 dígitos de la cuenta" error={estado.errores?.numeroFinal}>
        <Input name="numeroFinal" inputMode="numeric" pattern="\d{4}" maxLength={4} defaultValue={v.numeroFinal ?? sugerida?.numeroFinal ?? ""} placeholder="1234" required />
      </Campo>
      <Campo etiqueta="Nombre para reconocerla (opcional)" error={estado.errores?.alias}>
        <Input name="alias" defaultValue={v.alias ?? ""} maxLength={60} placeholder="Ej. Cuenta gastos comunes" />
      </Campo>
      <p className="text-xs text-texto-suave sm:col-span-2">
        Convive guarda solo el banco, el tipo y los últimos 4 dígitos. Nunca pide ni guarda claves bancarias.
      </p>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Boton type="submit" disabled={pendiente}>
          {pendiente ? "Guardando…" : "Registrar cuenta"}
        </Boton>
        <Mensaje texto={estado.mensaje} />
      </div>
    </form>
  );
}

/** Editar un perfil de cartola: nombre, banco, formatos y equivalencia de cada columna. */
export function FormularioPerfil({
  accion,
  perfil,
}: {
  accion: Accion;
  perfil: { nombre: string; banco: string; formatoFecha: string; separadorDecimal: string; signoMonto: string; columnas: Record<string, string> };
}) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  return (
    <form action={enviar} className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Campo etiqueta="Nombre del perfil" error={estado.errores?.nombre}>
          <Input name="nombre" defaultValue={perfil.nombre} required minLength={2} maxLength={60} />
        </Campo>
        <Campo etiqueta="Banco" error={estado.errores?.banco}>
          <Input name="banco" defaultValue={perfil.banco} required minLength={2} maxLength={60} />
        </Campo>
        <Campo etiqueta="Fechas">
          <Select name="formatoFecha" defaultValue={perfil.formatoFecha}>
            {Object.entries(TEXTO_FORMATO_FECHA).map(([k, t]) => (
              <option key={k} value={k}>
                {t}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo etiqueta="Montos">
          <Select name="separadorDecimal" defaultValue={perfil.separadorDecimal}>
            {Object.entries(TEXTO_SEPARADOR).map(([k, t]) => (
              <option key={k} value={k}>
                {t}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo etiqueta="Signo (si hay una sola columna de monto)">
          <Select name="signoMonto" defaultValue={perfil.signoMonto}>
            {Object.entries(TEXTO_SIGNO).map(([k, t]) => (
              <option key={k} value={k}>
                {t}
              </option>
            ))}
          </Select>
        </Campo>
      </div>
      <Tabla>
        <thead>
          <tr>
            <th>Columna de la cartola (título)</th>
            <th>Campo de Convive</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(perfil.columnas).map(([titulo, campo]) => (
            <tr key={titulo}>
              <td className="font-semibold">{titulo}</td>
              <td className="min-w-48">
                <Select name={`col:${titulo}`} defaultValue={campo} aria-label={`Campo de la columna ${titulo}`}>
                  <option value="ignorar">No utilizar</option>
                  {CAMPOS_CARTOLA.map((c) => (
                    <option key={c.clave} value={c.clave}>
                      {c.titulo}
                    </option>
                  ))}
                </Select>
              </td>
            </tr>
          ))}
        </tbody>
      </Tabla>
      <div className="flex flex-wrap items-center gap-3">
        <Boton type="submit" disabled={pendiente}>
          {pendiente ? "Guardando…" : "Guardar perfil"}
        </Boton>
        <Mensaje texto={estado.mensaje} tipo={estado.ok ? "ok" : "error"} />
      </div>
    </form>
  );
}

/** Marcar un movimiento como «Requiere revisión» (con nota) o devolverlo a «Pendiente de identificar». */
export function MarcarMovimiento({ accion, estado: actual, nota }: { accion: Accion; estado: string; nota: string | null }) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  if (actual === "CONCILIADO" || actual === "SUGERIDA") return null;
  return (
    <details className="text-xs">
      <summary className="cursor-pointer font-semibold text-marca">Cambiar estado</summary>
      <form action={enviar} className="mt-2 space-y-2">
        <Select name="estado" defaultValue={actual === "REVISAR" ? "PENDIENTE" : "REVISAR"} aria-label="Nuevo estado">
          <option value="REVISAR">Requiere revisión</option>
          <option value="PENDIENTE">Pendiente de identificar</option>
        </Select>
        <Input name="nota" defaultValue={nota ?? ""} maxLength={300} placeholder="Nota (opcional)" aria-label="Nota" />
        <Boton type="submit" variante="secundario" disabled={pendiente}>
          Guardar
        </Boton>
        <Mensaje texto={estado.ok ? undefined : estado.mensaje} />
      </form>
    </details>
  );
}
