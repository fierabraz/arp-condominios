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
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        {descripcion && <p className="mt-1 text-sm text-gray-600">{descripcion}</p>}
      </div>
      {acciones && <div className="flex gap-2">{acciones}</div>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

const estilosBoton = {
  primario: "bg-blue-600 text-white hover:bg-blue-700",
  secundario: "border border-gray-300 bg-white text-gray-800 hover:bg-gray-50",
  peligro: "border border-red-200 bg-white text-red-700 hover:bg-red-50",
};

type Variante = keyof typeof estilosBoton;
const baseBoton =
  "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50";

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
      <span className="mb-1 block text-sm font-medium text-gray-700">{etiqueta}</span>
      {children}
      {error && <span className="mt-1 block text-sm text-red-600">{error.join(" ")}</span>}
    </label>
  );
}

const baseInput =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100";

export function Input(props: ComponentProps<"input">) {
  return <input className={baseInput} {...props} />;
}

export function Select(props: ComponentProps<"select">) {
  return <select className={baseInput} {...props} />;
}

export function Tabla({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full text-left text-sm [&_td]:px-4 [&_td]:py-3 [&_th]:px-4 [&_th]:py-3 [&_th]:font-medium [&_th]:text-gray-600 [&_thead]:bg-gray-50 [&_tbody_tr]:border-t [&_tbody_tr]:border-gray-100">
        {children}
      </table>
    </div>
  );
}

export function Vacio({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-600">
      {children}
    </div>
  );
}

export function Mensaje({ texto, tipo = "error" }: { texto?: string; tipo?: "error" | "ok" }) {
  if (!texto) return null;
  const color = tipo === "error" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700";
  return <p className={`rounded-lg px-3 py-2 text-sm ${color}`}>{texto}</p>;
}
