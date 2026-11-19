"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Paperclip } from "lucide-react";
import { Boton, Campo, Input, Mensaje } from "@/components/ui";
import type { EstadoInforme } from "../actions";

const TAMANO_MAXIMO = 900 * 1024;
const BANCOS = ["BancoEstado", "Banco de Chile", "Santander", "BCI", "Scotiabank", "Itaú", "Banco Security", "Banco BICE", "Banco Falabella", "Banco Ripley", "Banco Internacional", "Banco Consorcio", "Tenpo", "Mercado Pago", "MACH", "Coopeuch"];

/** Achica una foto grande (las del teléfono pesan varios MB) a un JPG liviano antes de enviarla. */
async function achicar(archivo: File): Promise<File | null> {
  if (!archivo.type.startsWith("image/")) return null;
  const imagen = await createImageBitmap(archivo);
  const escala = Math.min(1, 1600 / Math.max(imagen.width, imagen.height));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(imagen.width * escala);
  lienzo.height = Math.round(imagen.height * escala);
  lienzo.getContext("2d")!.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
  for (const calidad of [0.8, 0.6, 0.45]) {
    const blob = await new Promise<Blob | null>((r) => lienzo.toBlob(r, "image/jpeg", calidad));
    if (blob && blob.size <= TAMANO_MAXIMO) return new File([blob], archivo.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  }
  return null;
}

export function FormularioInforme({
  accion,
  unidadId,
  avisoId,
  montoSugerido,
  hoy,
}: {
  accion: (formData: FormData) => Promise<EstadoInforme>;
  unidadId: string;
  avisoId?: string;
  montoSugerido: number;
  hoy: string;
}) {
  const [estado, setEstado] = useState<EstadoInforme>({});
  const [pendiente, iniciar] = useTransition();
  const [errorArchivo, setErrorArchivo] = useState<string>();
  const [confirmar, setConfirmar] = useState(false);
  const e = estado.errores ?? {};

  function enviar(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const fd = new FormData(ev.currentTarget);
    iniciar(async () => {
      setErrorArchivo(undefined);
      const archivo = fd.get("comprobante");
      if (archivo instanceof File && archivo.size > TAMANO_MAXIMO) {
        const chico = await achicar(archivo).catch(() => null);
        if (!chico) {
          setErrorArchivo("El comprobante pesa más de 900 KB. Sube una captura o una foto más liviana, o el PDF que entrega tu banco.");
          return;
        }
        fd.set("comprobante", chico);
      }
      if (confirmar) fd.set("confirmar", "1");
      // Se llama a la acción directamente (no con <form action>) para que el formulario no se borre si hay que corregir algo.
      const r = await accion(fd);
      if (r) setEstado(r);
    });
  }

  return (
    <form onSubmit={enviar} className="space-y-4" noValidate>
      <input type="hidden" name="unidadId" value={unidadId} />
      {avisoId && <input type="hidden" name="avisoId" value={avisoId} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Fecha de la transferencia" error={e.fecha}>
          <Input name="fecha" type="date" required max={hoy} defaultValue={hoy} />
        </Campo>
        <Campo etiqueta="Monto transferido" error={e.monto}>
          <Input name="monto" inputMode="numeric" required defaultValue={montoSugerido > 0 ? String(Math.round(montoSugerido)) : ""} placeholder="Ej: 85000" />
        </Campo>
        <Campo etiqueta="Banco de origen (opcional)" error={e.bancoOrigen}>
          <Input name="bancoOrigen" list="bancos" maxLength={60} placeholder="Desde qué banco transferiste" />
          <datalist id="bancos">
            {BANCOS.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </Campo>
        <Campo etiqueta="N° de operación o referencia (opcional)" error={e.operacion}>
          <Input name="operacion" maxLength={40} placeholder="Aparece en el comprobante" />
        </Campo>
      </div>
      <Campo etiqueta="¿La hizo otra persona? Su nombre (opcional)" error={e.pagadoPor}>
        <Input name="pagadoPor" maxLength={80} placeholder="Por ejemplo, un familiar o la corredora" />
      </Campo>
      <Campo etiqueta="Comprobante (opcional): PDF o imagen" error={errorArchivo ? [errorArchivo] : e.comprobante}>
        <span className="flex items-center gap-2 rounded-xl border border-dashed border-convive/50 bg-white px-3 py-2">
          <Paperclip size={18} aria-hidden="true" className="shrink-0 text-marca" />
          <input name="comprobante" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="min-h-9 w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-convive-suave file:px-3 file:py-1.5 file:font-semibold file:text-convive-oscuro" />
        </span>
      </Campo>
      <Campo etiqueta="Observaciones (opcional)" error={e.observaciones}>
        <textarea
          name="observaciones"
          rows={3}
          maxLength={500}
          className="w-full rounded-xl border border-borde bg-white px-3 py-2 text-base focus:border-convive focus:outline-none focus:ring-2 focus:ring-convive/25 md:text-sm"
          placeholder="Por ejemplo: pago de octubre y noviembre"
        />
      </Campo>

      {estado.repetida && (
        <div role="alert" className="rounded-2xl border border-alerta/40 bg-alerta-suave p-4 text-sm">
          <p className="mb-1 flex items-center gap-2 font-bold text-alerta">
            <AlertTriangle size={18} aria-hidden="true" /> Parece que esta transferencia ya fue informada
          </p>
          <ul className="mb-2 list-disc pl-5">
            {estado.repetida.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          <label className="flex min-h-11 items-center gap-2 font-semibold">
            <input type="checkbox" checked={confirmar} onChange={(x) => setConfirmar(x.target.checked)} className="h-5 w-5" />
            Es otra transferencia distinta: informarla de todas formas
          </label>
        </div>
      )}
      <Mensaje texto={estado.mensaje} />
      <p className="text-xs text-texto-suave">
        Al enviar, la transferencia queda pendiente de verificación. Tu deuda no cambia hasta que la administración la
        encuentre en la cartola del banco.
      </p>
      <Boton type="submit" disabled={pendiente || (!!estado.repetida && !confirmar)} className="w-full sm:w-auto">
        {pendiente ? "Enviando…" : "Informar transferencia"}
      </Boton>
    </form>
  );
}
