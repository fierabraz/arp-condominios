import Link from "next/link";
import { db } from "@/lib/db";
import { BotonLink, PageHeader, Tabla, Vacio } from "@/components/ui";
import { formatoFechaHora } from "@/lib/formato";
import { condominioVisible } from "../condominio-actual";

const PESTANAS = [
  { clave: "borrador", texto: "Por publicar" },
  { clave: "abiertas", texto: "Abiertas" },
  { clave: "cerradas", texto: "Cerradas" },
] as const;

export default async function VotacionesPage({ params, searchParams }: PageProps<"/condominios/[id]/votaciones">) {
  const { id } = await params;
  const { estado: pedido } = await searchParams;
  const pestana = PESTANAS.find((p) => p.clave === pedido)?.clave ?? "abiertas";
  const { condominio, editable } = await condominioVisible(id);
  const ahora = new Date();

  const where =
    pestana === "borrador"
      ? { estado: "BORRADOR" as const }
      : pestana === "abiertas"
        ? { estado: "ABIERTA" as const, cierraEn: { gt: ahora } }
        : { OR: [{ estado: "CERRADA" as const }, { estado: "ABIERTA" as const, cierraEn: { lte: ahora } }] };
  const [votaciones, totalUnidades] = await Promise.all([
    db.votacion.findMany({
      where: { condominioId: id, ...where },
      orderBy: { cierraEn: pestana === "cerradas" ? "desc" : "asc" },
      include: { _count: { select: { votos: true } } },
    }),
    db.unidad.count({ where: { condominioId: id } }),
  ]);
  const base = `/condominios/${id}/votaciones`;

  return (
    <>
      <PageHeader
        titulo="Votaciones"
        descripcion={`${condominio.nombre} · Consultas en línea a los propietarios, una respuesta por unidad.`}
        acciones={editable && <BotonLink href={`${base}/nueva`}>+ Nueva votación</BotonLink>}
      />
      <nav className="mb-4 flex gap-1 text-sm" aria-label="Estado">
        {PESTANAS.filter((p) => editable || p.clave !== "borrador").map((p, i) => (
          <span key={p.clave} className="flex items-center gap-1">
            {i > 0 && <span className="text-gray-300">|</span>}
            <Link
              href={`${base}?estado=${p.clave}`}
              aria-current={p.clave === pestana ? "page" : undefined}
              className={`px-1 ${p.clave === pestana ? "font-semibold text-blue-700" : "text-gray-600 hover:text-gray-900"}`}
            >
              {p.texto}
            </Link>
          </span>
        ))}
      </nav>
      {votaciones.length === 0 ? (
        <Vacio>No hay votaciones {PESTANAS.find((p) => p.clave === pestana)!.texto.toLowerCase()}.</Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Respuestas</th>
              <th>Fecha de término</th>
              <th className="text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {votaciones.map((v) => (
              <tr key={v.id}>
                <td className="font-medium">{v.titulo}</td>
                <td>
                  {v._count.votos} de {totalUnidades} unidades
                </td>
                <td>{formatoFechaHora(v.cierraEn)}</td>
                <td className="text-right">
                  <Link href={`${base}/${v.id}`} className="text-blue-700 hover:underline">
                    {pestana === "borrador" ? "Revisar y publicar" : pestana === "abiertas" ? "Ver avance" : "Ver resultados"}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
