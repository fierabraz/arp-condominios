import Link from "next/link";
import { Download } from "lucide-react";
import { db } from "@/lib/db";
import { Boton, BotonDocumento, BotonLink, Input, Insignia, PageHeader, Select, Tabla, Vacio } from "@/components/ui";
import { ESTADOS_CONCILIACION, type EstadoConciliacion } from "@/lib/cartolas";
import { dondeMovimientos, leerFiltro } from "@/lib/cartolas-consulta";
import { formatoMoneda } from "@/lib/formato";
import { puede } from "@/lib/permisos";
import { condominioVisible } from "../../condominio-actual";
import { marcarMovimiento } from "../../../conciliacion-actions";
import { MarcarMovimiento } from "../formularios";

// FIN-003.1 · Consulta bancaria: movimientos importados, con filtros y descarga en CSV.

const POR_PAGINA = 50;
const dia = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join("-");

export default async function MovimientosPage({ params, searchParams }: PageProps<"/condominios/[id]/conciliacion/movimientos">) {
  const { id } = await params;
  const sp = await searchParams;
  const { condominio, usuario, administradoraId, moneda } = await condominioVisible(id);
  const editable = puede(usuario, "banco.importar", id);
  const base = `/condominios/${id}/conciliacion`;
  const $ = (n: number) => formatoMoneda(n, moneda);
  const filtro = leerFiltro(sp);
  const pagina = Math.max(1, Math.min(10_000, Number(Array.isArray(sp.pagina) ? sp.pagina[0] : sp.pagina) || 1));

  const cuentas = await db.cuentaBancaria.findMany({ where: { condominioId: id, administradoraId }, orderBy: { creadoEn: "asc" } });
  if (filtro.cuenta && !cuentas.some((c) => c.id === filtro.cuenta)) filtro.cuenta = undefined;
  const donde = dondeMovimientos(id, administradoraId, filtro);
  const [total, sumaAbonos, sumaCargos, movimientos] = await Promise.all([
    db.movimientoBancario.count({ where: donde }),
    db.movimientoBancario.aggregate({ where: { AND: [donde, { monto: { gt: 0 } }] }, _sum: { monto: true } }),
    db.movimientoBancario.aggregate({ where: { AND: [donde, { monto: { lt: 0 } }] }, _sum: { monto: true } }),
    db.movimientoBancario.findMany({
      where: donde,
      orderBy: [{ fecha: "desc" }, { creadoEn: "desc" }, { fila: "asc" }],
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
      include: { cuenta: { select: { banco: true, numeroFinal: true } }, importacion: { select: { id: true, archivoNombre: true } } },
    }),
  ]);
  const consulta = (extra: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...filtro, ...extra })) if (v !== undefined && v !== "") q.set(k, String(v));
    return q.toString();
  };
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <>
      <PageHeader
        titulo="Movimientos bancarios"
        descripcion={`${condominio.nombre} · Movimientos importados desde las cartolas.`}
        acciones={
          <>
            <BotonLink href={`${base}${filtro.cuenta ? `?cuenta=${filtro.cuenta}` : ""}`} variante="secundario">
              Volver a conciliación
            </BotonLink>
            {total > 0 && (
              <BotonDocumento href={`${base}/movimientos/csv?${consulta({})}`} target="_self">
                <Download size={16} aria-hidden="true" /> Descargar CSV
              </BotonDocumento>
            )}
          </>
        }
      />

      <form method="get" className="sombra-convive mb-4 grid gap-3 rounded-2xl border border-borde bg-white p-4 sm:grid-cols-2 lg:grid-cols-6">
        <label className="block text-sm lg:col-span-2">
          <span className="mb-1 block font-semibold">Cuenta</span>
          <Select name="cuenta" defaultValue={filtro.cuenta ?? ""}>
            <option value="">Todas las cuentas</option>
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.banco} ···{c.numeroFinal}
              </option>
            ))}
          </Select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-semibold">Estado</span>
          <Select name="estado" defaultValue={filtro.estado ?? ""}>
            <option value="">Todos</option>
            {(Object.keys(ESTADOS_CONCILIACION) as EstadoConciliacion[]).map((e) => (
              <option key={e} value={e}>
                {ESTADOS_CONCILIACION[e].texto}
              </option>
            ))}
          </Select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-semibold">Tipo</span>
          <Select name="tipo" defaultValue={filtro.tipo ?? ""}>
            <option value="">Cargos y abonos</option>
            <option value="abono">Solo abonos</option>
            <option value="cargo">Solo cargos</option>
          </Select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-semibold">Desde</span>
          <Input type="date" name="desde" defaultValue={filtro.desde ?? ""} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-semibold">Hasta</span>
          <Input type="date" name="hasta" defaultValue={filtro.hasta ?? ""} />
        </label>
        <label className="block text-sm sm:col-span-2 lg:col-span-4">
          <span className="mb-1 block font-semibold">Buscar</span>
          <Input type="search" name="q" defaultValue={filtro.q ?? ""} placeholder="Descripción, referencia o emisor" maxLength={100} />
        </label>
        <div className="flex items-end gap-2 lg:col-span-2">
          <Boton type="submit">Filtrar</Boton>
          <Link href={`${base}/movimientos`} className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-marca hover:underline">
            Limpiar
          </Link>
        </div>
      </form>

      <p className="mb-3 text-sm text-texto-suave">
        {total} {total === 1 ? "movimiento" : "movimientos"} · Abonos {$(Number(sumaAbonos._sum.monto ?? 0))} · Cargos {$(-Number(sumaCargos._sum.monto ?? 0))}
      </p>

      {movimientos.length === 0 ? (
        <Vacio>No hay movimientos con estos filtros. Carga una cartola desde Conciliación bancaria.</Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Descripción</th>
              <th>Referencia</th>
              <th className="text-right">Cargo</th>
              <th className="text-right">Abono</th>
              <th className="text-right">Saldo</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {movimientos.map((m) => {
              const monto = Number(m.monto);
              const est = ESTADOS_CONCILIACION[m.estado];
              return (
                <tr key={m.id}>
                  <td className="whitespace-nowrap">
                    {dia(m.fecha)}
                    {!filtro.cuenta && cuentas.length > 1 && (
                      <span className="block text-xs text-texto-suave">
                        {m.cuenta.banco} ···{m.cuenta.numeroFinal}
                      </span>
                    )}
                  </td>
                  <td className="min-w-48">
                    {m.descripcion ?? "—"}
                    {(m.contraparte || m.rutContraparte) && (
                      <span className="block text-xs text-texto-suave">{[m.contraparte, m.rutContraparte].filter(Boolean).join(" · ")}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap">{m.referencia ?? "—"}</td>
                  <td className="whitespace-nowrap text-right text-peligro">{monto < 0 ? $(-monto) : ""}</td>
                  <td className="whitespace-nowrap text-right text-exito">{monto > 0 ? $(monto) : ""}</td>
                  <td className="whitespace-nowrap text-right">{m.saldo === null ? "—" : $(Number(m.saldo))}</td>
                  <td className="min-w-48">
                    <Insignia tono={est.tono}>{est.texto}</Insignia>
                    {m.nota && <span className="mt-1 block text-xs text-texto-suave">{m.nota}</span>}
                    <Link href={`${base}/importaciones/${m.importacion.id}`} className="mt-1 block text-xs text-texto-suave hover:underline">
                      {m.importacion.archivoNombre}
                      {m.fila ? `, fila ${m.fila}` : ""}
                    </Link>
                    {editable && <MarcarMovimiento accion={marcarMovimiento.bind(null, id, m.id)} estado={m.estado} nota={m.nota} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Tabla>
      )}

      {paginas > 1 && (
        <nav className="mt-4 flex flex-wrap items-center gap-3 text-sm" aria-label="Páginas">
          {pagina > 1 && (
            <Link href={`?${consulta({ pagina: pagina - 1 })}`} className="font-semibold text-marca hover:underline">
              ← Anteriores
            </Link>
          )}
          <span className="text-texto-suave">
            Página {pagina} de {paginas}
          </span>
          {pagina < paginas && (
            <Link href={`?${consulta({ pagina: pagina + 1 })}`} className="font-semibold text-marca hover:underline">
              Siguientes →
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
