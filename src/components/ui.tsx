import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function PageHeader({
  titulo,
  descripcion,
  acciones,
}: {
  titulo: string;
  descripcion?: ReactNode;
  acciones?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-[1.75rem]">{titulo}</h1>
        {descripcion && <p className="mt-1 text-sm text-texto-suave">{descripcion}</p>}
      </div>
      {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-borde bg-white p-5 ${className}`}>
      {children}
    </div>
  );
}

const estilosBoton = {
  primario: "bg-marca text-white hover:bg-marca-oscuro",
  secundario: "border border-gray-300 bg-white text-texto hover:bg-gray-50",
  peligro: "border border-peligro-suave bg-white text-peligro hover:bg-peligro-suave",
};

type Variante = keyof typeof estilosBoton;
const baseBoton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-50";

export function Boton({
  variante = "primario",
  className = "",
  ...props
}: ComponentProps<"button"> & { variante?: Variante }) {
  return <button className={`${baseBoton} ${estilosBoton[variante]} ${className}`} {...props} />;
}

export function BotonLink({
  variante = "primario",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variante?: Variante }) {
  return <Link className={`${baseBoton} ${estilosBoton[variante]} ${className}`} {...props} />;
}

/** Enlace con estilo de botón para documentos (PDF) que no deben pasar por el enrutador. */
export function BotonDocumento({
  variante = "secundario",
  className = "",
  ...props
}: ComponentProps<"a"> & { variante?: Variante }) {
  return <a target="_blank" rel="noopener" className={`${baseBoton} ${estilosBoton[variante]} ${className}`} {...props} />;
}

export function Campo({
  etiqueta,
  error,
  children,
}: {
  etiqueta: string;
  error?: string[];
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-texto">{etiqueta}</span>
      {children}
      {error && <span className="mt-1 block text-sm text-peligro">{error.join(" ")}</span>}
    </label>
  );
}

const baseInput =
  "min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-base focus:border-marca focus:outline-none focus:ring-2 focus:ring-marca-suave md:text-sm";

export function Input(props: ComponentProps<"input">) {
  return <input className={baseInput} {...props} />;
}

export function Select(props: ComponentProps<"select">) {
  return <select className={baseInput} {...props} />;
}

export function Tabla({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-borde bg-white">
      <table className="w-full text-left text-sm [&_td]:px-4 [&_td]:py-3 [&_th]:px-4 [&_th]:py-3 [&_th]:font-semibold [&_th]:text-texto-suave [&_thead]:bg-gray-50 [&_tbody_tr]:border-t [&_tbody_tr]:border-gray-100">
        {children}
      </table>
    </div>
  );
}

export function Vacio({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-texto-suave">
      {children}
    </div>
  );
}

export function Mensaje({ texto, tipo = "error" }: { texto?: string; tipo?: "error" | "ok" }) {
  if (!texto) return null;
  const color = tipo === "error" ? "bg-peligro-suave text-peligro" : "bg-exito-suave text-exito";
  return <p className={`rounded-xl px-3 py-2 text-sm ${color}`}>{texto}</p>;
}

const estilosInsignia = {
  exito: "bg-exito-suave text-exito",
  alerta: "bg-alerta-suave text-alerta",
  peligro: "bg-peligro-suave text-peligro",
  neutro: "bg-gray-100 text-texto",
  marca: "bg-marca-suave text-marca",
};

/** Etiqueta corta de estado: Al día, Deuda vencida, Borrador... */
export function Insignia({ tono = "neutro", children }: { tono?: keyof typeof estilosInsignia; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${estilosInsignia[tono]}`}>
      {children}
    </span>
  );
}

/** Cifra principal de un panel, con su etiqueta y una línea de apoyo. */
export function Indicador({
  etiqueta,
  valor,
  tono,
  children,
}: {
  etiqueta: string;
  valor: ReactNode;
  tono?: "peligro";
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-borde bg-white p-5">
      <span className="text-sm text-texto-suave">{etiqueta}</span>
      <span className={`text-3xl font-bold ${tono === "peligro" ? "text-peligro" : ""}`}>{valor}</span>
      {children}
    </div>
  );
}
