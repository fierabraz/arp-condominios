"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** PAG-001: copia un dato (número de cuenta, RUT, monto...) al portapapeles con un toque. */
export function BotonCopiar({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor);
    } catch {
      // Navegadores antiguos o sin permiso: copiar con un campo temporal.
      const campo = document.createElement("textarea");
      campo.value = valor;
      campo.setAttribute("readonly", "");
      campo.style.position = "fixed";
      campo.style.opacity = "0";
      document.body.appendChild(campo);
      campo.select();
      document.execCommand("copy");
      campo.remove();
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }
  return (
    <button
      type="button"
      onClick={copiar}
      aria-label={`Copiar ${etiqueta}`}
      className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-convive ${
        copiado ? "border-exito/40 bg-exito-suave text-exito" : "border-borde bg-white text-convive-oscuro hover:border-convive hover:bg-convive-suave"
      }`}
    >
      {copiado ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
      <span aria-live="polite">{copiado ? "Copiado" : "Copiar"}</span>
    </button>
  );
}
