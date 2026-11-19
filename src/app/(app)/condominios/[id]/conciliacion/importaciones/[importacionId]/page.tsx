import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { BotonLink, Card, Insignia, PageHeader, Tabla } from "@/components/ui";
import { ESTADOS_CONCILIACION, type ErrorCartola } from "@/lib/cartolas";
import { formatoFechaHora, formatoMoneda } from "@/lib/formato";
import { condominioVisible } from "../../../condominio-actual";

// FIN-003.1 · Detalle de una importación: de qué archivo salió, qué se incorporó y qué quedó fuera.

const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10).split("-").reverse().join("-") : "—");

export default async function ImportacionPage({ params }: PageProps<"/condominios/[id]/conciliacion/importaciones/[importacionId]">) {
  const { id, importacionId } = await params;
  const { condominio, administradoraId, moneda } = await condominioVisible(id);
  const i = await db.importacionCartola.findFirst({
    where: { id: importacionId, condominioId: id, administradoraId },
    include: {
      cuenta: { select: { id: true, banco: true, numeroFinal: true } },
      movimientos: { orderBy: [{ fecha: "asc" }, { fila: "asc" }], take: 1000 },
    },
  });
  if (!i) notFound();
  const $ = (n: number) => formatoMoneda(n, moneda);
  const errores = (i.detalleErrores ?? []) as ErrorCartola[];
  const base = `/condominios/${id}/conciliacion`;
  const datos: [string, string][] = [
    ["Comunidad", condominio.nombre],
    ["Cuenta", `${i.cuenta.banco} ···${i.cuenta.numeroFinal}`],
    ["Archivo", `${i.archivoNombre} (${i.formato === "XLSX" ? "Excel" : "CSV"}, ${(i.archivoTamano / 1024).toLocaleString("es-CL", { maximumFractionDigits: 1 })} KB)`],
    ["Hojas leídas", i.hojas.join(", ") || "—"],
    ["Perfil usado", i.perfilNombre ?? "Reconocimiento automático o asistente"],
    ["Período reconocido", `${dia(i.desde)} al ${dia(i.hasta)}`],
    ["Cargada", `${formatoFechaHora(i.creadoEn)} por ${i.usuarioNombre}`],
    ["Huella digital del archivo (SHA-256)", i.archivoHuella],
  ];

  return (
    <>
      <PageHeader
        titulo="Importación de cartola"
        descripcion={`${i.archivoNombre} · ${i.cuenta.banco} ···${i.cuenta.numeroFinal}`}
        acciones={
          <BotonLink href={`${base}?cuenta=${i.cuenta.id}`} variante="secundario">
            Volver a conciliación
          </BotonLink>
        }
      />
      <div className="mb-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[14rem_1fr]">
            {datos.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="font-semibold">{k}</dt>
                <dd className="break-all text-texto-suave">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card>
          <ul className="space-y-1 text-sm">
            <li>
              <span className="font-bold">{i.encontrados}</span> movimientos encontrados
            </li>
            <li>
              <span className="font-bold text-marca">{i.nuevos}</span> incorporados
            </li>
            <li>
              <span className="font-bold">{i.yaRegistrados}</span> ya registrados (no se repitieron)
            </li>
            <li>
              <span className="font-bold">{i.posiblesDuplicados}</span> posibles duplicados ({i.duplicadosOmitidos} omitidos)
            </li>
            <li>
              <span className="font-bold">{i.errores}</span> filas con error (quedaron fuera)
            </li>
          </ul>
          <p className="mt-3">
            <Insignia tono="exito">Aplicada</Insignia>
          </p>
        </Card>
      </div>

      {errores.length > 0 && (
        <section className="mb-6" aria-labelledby="errores">
          <h2 id="errores" className="mb-2 text-lg font-bold">
            Filas con error que quedaron fuera
          </h2>
          <ul className="max-h-72 list-inside list-disc space-y-1 overflow-y-auto rounded-xl border border-peligro-suave bg-peligro-suave/40 p-4 text-sm text-peligro">
            {errores.map((e, k) => (
              <li key={k}>
                {e.hoja === i.archivoNombre ? "" : `Hoja ${e.hoja}, `}fila {e.fila}: {e.mensaje}
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 className="mb-2 text-lg font-bold">Movimientos incorporados</h2>
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
            <th>Origen</th>
          </tr>
        </thead>
        <tbody>
          {i.movimientos.map((m) => {
            const monto = Number(m.monto);
            const est = ESTADOS_CONCILIACION[m.estado];
            return (
              <tr key={m.id}>
                <td className="whitespace-nowrap">{dia(m.fecha)}</td>
                <td className="min-w-48">{m.descripcion ?? "—"}</td>
                <td>{m.referencia ?? "—"}</td>
                <td className="whitespace-nowrap text-right text-peligro">{monto < 0 ? $(-monto) : ""}</td>
                <td className="whitespace-nowrap text-right text-exito">{monto > 0 ? $(monto) : ""}</td>
                <td className="whitespace-nowrap text-right">{m.saldo === null ? "—" : $(Number(m.saldo))}</td>
                <td>
                  <Insignia tono={est.tono}>{est.texto}</Insignia>
                  {m.nota && <span className="mt-1 block text-xs text-texto-suave">{m.nota}</span>}
                </td>
                <td className="whitespace-nowrap text-xs text-texto-suave">
                  {m.hoja && m.hoja !== i.archivoNombre ? `${m.hoja}, ` : ""}fila {m.fila}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Tabla>
    </>
  );
}
