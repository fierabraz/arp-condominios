import Link from "next/link";
import { requireAdministradora } from "@/lib/auth";
import { db } from "@/lib/db";
import { BotonLink, Boton, PageHeader, Select, Vacio } from "@/components/ui";
import { formatoFechaHora } from "@/lib/formato";

const POR_PAGINA = 50;

export default async function RegistroPage({ searchParams }: PageProps<"/registro">) {
  const { administradoraId } = await requireAdministradora();
  const { propiedad, antes } = await searchParams;
  const condominioId = typeof propiedad === "string" && propiedad ? propiedad : undefined;
  const hasta = typeof antes === "string" && !Number.isNaN(Date.parse(antes)) ? new Date(antes) : undefined;

  const [propiedades, filas] = await Promise.all([
    db.condominio.findMany({ where: { administradoraId }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true } }),
    db.registroCambio.findMany({
      where: { administradoraId, ...(condominioId ? { condominioId } : {}), ...(hasta ? { creadoEn: { lt: hasta } } : {}) },
      orderBy: { creadoEn: "desc" },
      take: POR_PAGINA + 1,
    }),
  ]);
  const hayMas = filas.length > POR_PAGINA;
  const visibles = filas.slice(0, POR_PAGINA);
  const nombreDe = new Map(propiedades.map((p) => [p.id, p.nombre]));
  const masHref = (() => {
    const q = new URLSearchParams();
    if (condominioId) q.set("propiedad", condominioId);
    q.set("antes", visibles.at(-1)!.creadoEn.toISOString());
    return `/registro?${q}`;
  });

  return (
    <>
      <PageHeader
        titulo="Registro de cambios"
        descripcion="Quién hizo qué y cuándo: pagos, cobros, gastos, unidades, cuentas y publicaciones. No se puede editar ni borrar."
      />
      <form className="mb-4 flex flex-wrap items-end gap-2" action="/registro">
        <label className="min-w-56 flex-1 md:max-w-xs">
          <span className="mb-1 block text-sm font-semibold">Propiedad</span>
          <Select name="propiedad" defaultValue={condominioId ?? ""}>
            <option value="">Todas</option>
            {propiedades.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Select>
        </label>
        <Boton type="submit" variante="secundario">
          Filtrar
        </Boton>
      </form>

      {visibles.length === 0 ? (
        <Vacio>{hasta ? "No hay cambios más antiguos." : "Todavía no hay cambios registrados."}</Vacio>
      ) : (
        <ol className="divide-y divide-borde overflow-hidden rounded-2xl border border-borde bg-white">
          {visibles.map((r) => (
            <li key={r.id} className="grid gap-1 p-4 md:grid-cols-[11rem_1fr] md:gap-4">
              <time dateTime={r.creadoEn.toISOString()} className="text-sm text-texto-suave">
                {formatoFechaHora(r.creadoEn)}
              </time>
              <div className="min-w-0">
                <p>
                  <span className="font-semibold">{r.usuarioNombre}</span> · {r.accion}
                </p>
                <p className="break-words text-sm text-texto-suave">
                  {r.detalle}
                  {r.condominioId && !condominioId && nombreDe.has(r.condominioId) && (
                    <>
                      {" · "}
                      <Link href={`/condominios/${r.condominioId}`} className="text-marca hover:underline">
                        {nombreDe.get(r.condominioId)}
                      </Link>
                    </>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
      {hayMas && (
        <div className="mt-4">
          <BotonLink href={masHref()} variante="secundario">
            Ver cambios anteriores
          </BotonLink>
        </div>
      )}
    </>
  );
}
