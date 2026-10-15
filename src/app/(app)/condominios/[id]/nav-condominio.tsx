import Link from "next/link";

const PESTANAS = [
  { ruta: "", texto: "Unidades" },
  { ruta: "/periodos", texto: "Períodos y gastos" },
  { ruta: "/pagos", texto: "Pagos" },
  { ruta: "/morosidad", texto: "Morosidad" },
] as const;

export function NavCondominio({ id, actual }: { id: string; actual: (typeof PESTANAS)[number]["ruta"] }) {
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-gray-200">
      {PESTANAS.map((p) => (
        <Link
          key={p.ruta}
          href={`/condominios/${id}${p.ruta}`}
          className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
            p.ruta === actual
              ? "border-blue-600 font-medium text-blue-700"
              : "border-transparent text-gray-600 hover:text-gray-900"
          }`}
        >
          {p.texto}
        </Link>
      ))}
    </nav>
  );
}
