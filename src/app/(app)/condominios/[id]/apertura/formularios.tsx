"use client";

// COM-001 · Entrega 5: formularios de la apertura financiera.

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Upload } from "lucide-react";
import { Boton, Campo, Input, Mensaje, Select, Tabla } from "@/components/ui";
import type { EstadoForm } from "@/lib/forms";
import { ESTADOS_DEUDA, textoPeriodo, type ErrorDeuda } from "@/lib/apertura";
import type { EstadoCargaDeudas } from "../../apertura-actions";

type Accion = (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>;

export type CampoForm = {
  name: string;
  etiqueta: string;
  tipo?: "texto" | "monto" | "fecha" | "mes" | "select";
  opciones?: { valor: string; texto: string }[];
  requerido?: boolean;
  placeholder?: string;
  ayuda?: string;
  valor?: string;
  /** Ocupa el ancho completo. */
  ancho?: boolean;
};

/** Formulario de una fila (deuda, fondo, cuenta…): se limpia al guardar bien. */
export function FormularioApertura({ accion, campos, textoBoton }: { accion: Accion; campos: CampoForm[]; textoBoton: string }) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado.ok) form.current?.reset();
  }, [estado]);
  const e = estado.errores ?? {};
  return (
    <form ref={form} action={enviar} className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {campos.map((c) => (
        <div key={c.name} className={c.ancho ? "sm:col-span-2 lg:col-span-4" : undefined}>
          <Campo etiqueta={c.etiqueta} error={e[c.name]}>
            {c.tipo === "select" ? (
              <Select name={c.name} defaultValue={c.valor ?? c.opciones?.[0]?.valor} required={c.requerido}>
                {c.opciones!.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.texto}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                name={c.name}
                type={c.tipo === "fecha" ? "date" : c.tipo === "mes" ? "month" : "text"}
                inputMode={c.tipo === "monto" ? "numeric" : undefined}
                required={c.requerido}
                placeholder={c.placeholder ?? (c.tipo === "monto" ? "$ 0" : undefined)}
                defaultValue={c.valor}
                list={c.name === "concepto" ? "conceptos" : undefined}
              />
            )}
          </Campo>
          {c.ayuda && <span className="mt-1 block text-xs text-texto-suave">{c.ayuda}</span>}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4">
        <Boton type="submit" disabled={pendiente}>
          {pendiente ? "Guardando…" : textoBoton}
        </Boton>
        <Mensaje texto={estado.mensaje} tipo={estado.ok ? "ok" : "error"} />
      </div>
    </form>
  );
}

const textoError = (e: ErrorDeuda) => (e.fila > 0 ? `${e.hoja ? `Hoja ${e.hoja}, fila` : "Fila"} ${e.fila}: ${e.mensaje}` : e.mensaje);
const pesos = (n: number) => `$ ${n.toLocaleString("es-CL")}`;

type AccionCarga = (estado: EstadoCargaDeudas, formData: FormData) => Promise<EstadoCargaDeudas>;

/** Carga de deudas desde planilla: revisar primero, confirmar después. */
export function CargaDeudas({ revisar, confirmar, plantilla }: { revisar: AccionCarga; confirmar: AccionCarga; plantilla: string }) {
  const [vuelta, setVuelta] = useState(0);
  return <PasosCarga key={vuelta} revisar={revisar} confirmar={confirmar} plantilla={plantilla} otraVez={() => setVuelta((v) => v + 1)} />;
}

function PasosCarga({ revisar, confirmar, plantilla, otraVez }: { revisar: AccionCarga; confirmar: AccionCarga; plantilla: string; otraVez: () => void }) {
  const [revision, enviar, leyendo] = useActionState(revisar, { etapa: "inicio" });
  const [final, confirmarCarga, guardando] = useActionState(confirmar, { etapa: "inicio" });

  if (final.etapa === "listo") {
    return (
      <div className="space-y-3">
        <p className="flex items-center gap-2 font-bold text-exito">
          <CheckCircle2 size={20} aria-hidden="true" /> {final.cargadas} deudas cargadas por {pesos(final.total)}
        </p>
        <Boton type="button" variante="secundario" onClick={otraVez}>
          Cargar otra planilla
        </Boton>
      </div>
    );
  }
  if (revision.etapa === "revision") {
    const r = revision;
    const errorFinal = final.etapa === "inicio" ? final.errores : undefined;
    return (
      <div className="space-y-4">
        <div>
          <h4 className="font-bold">Revisión de {r.archivo}</h4>
          <p className="text-sm text-texto-suave">
            {r.nuevas.length} deudas nuevas por {pesos(r.total)}
            {r.repetidas ? ` · ${r.repetidas} ya estaban cargadas y se saltan` : ""}. Todavía no se guardó nada.
          </p>
        </div>
        {r.errores.length > 0 && (
          <div className="rounded-xl border border-peligro-suave bg-peligro-suave p-4 text-sm text-peligro">
            <p className="mb-2 flex items-center gap-2 font-bold">
              <AlertTriangle size={18} aria-hidden="true" />
              {r.errores.length} {r.errores.length === 1 ? "fila tiene" : "filas tienen"} problemas. Corrígelas y vuelve a subir la planilla:
            </p>
            <ul className="max-h-64 list-inside list-disc space-y-1 overflow-y-auto">
              {r.errores.map((e, i) => (
                <li key={i}>{textoError(e)}</li>
              ))}
            </ul>
          </div>
        )}
        {r.nuevas.length > 0 && (
          <Tabla>
            <thead>
              <tr>
                <th>Unidad</th>
                <th>Período</th>
                <th>Concepto</th>
                <th className="text-right">Saldo</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {r.nuevas.slice(0, 50).map((d) => (
                <tr key={d.fila}>
                  <td className="font-semibold">{d.numero}</td>
                  <td>{textoPeriodo(d.periodo)}</td>
                  <td>{d.concepto}</td>
                  <td className="text-right whitespace-nowrap">{pesos(d.saldo)}</td>
                  <td>{ESTADOS_DEUDA[d.estado].texto}</td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
        {r.nuevas.length > 50 && <p className="text-sm text-texto-suave">Y {r.nuevas.length - 50} más.</p>}
        {errorFinal?.map((e, i) => <Mensaje key={i} texto={textoError(e)} />)}
        <form action={confirmarCarga} className="flex flex-wrap gap-2">
          <input type="hidden" name="filas" value={r.filas} />
          <input type="hidden" name="archivo" value={r.archivo} />
          <Boton type="submit" disabled={guardando || r.errores.length > 0 || r.nuevas.length === 0}>
            {guardando ? "Cargando…" : "Confirmar y cargar"}
          </Boton>
          <Boton type="button" variante="secundario" onClick={otraVez} disabled={guardando}>
            Subir otra planilla
          </Boton>
        </form>
      </div>
    );
  }
  return (
    <form action={enviar} className="space-y-3">
      <p className="text-sm text-texto-suave">
        Una fila por unidad, mes y concepto (nunca una fila de total).{" "}
        <Link href={plantilla} className="font-semibold text-marca hover:underline">
          Descargar planilla de deudas
        </Link>
      </p>
      <input
        type="file"
        name="archivo"
        required
        accept=".xlsx,.csv"
        className="block w-full rounded-xl border border-dashed border-borde bg-fondo p-4 text-sm file:mr-3 file:min-h-11 file:rounded-xl file:border-0 file:bg-marca file:px-4 file:font-semibold file:text-white"
      />
      {revision.etapa === "inicio" && revision.errores?.map((e, i) => <Mensaje key={i} texto={textoError(e)} />)}
      <Boton type="submit" disabled={leyendo}>
        <Upload size={16} aria-hidden="true" /> {leyendo ? "Leyendo planilla…" : "Revisar planilla"}
      </Boton>
    </form>
  );
}
