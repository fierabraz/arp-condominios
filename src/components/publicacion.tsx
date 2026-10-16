import Link from "next/link";
import { Download, Eye, Pencil, Share2, Trash2 } from "lucide-react";
import { BotonConfirmar } from "@/components/boton-confirmar";

export type DatosPublicacion = {
  id: string;
  titulo: string;
  contenido: string;
  autor: string;
  creadoEn: Date;
  condominio: { id: string; nombre: string };
};

const fechaLarga = (d: Date) =>
  new Intl.DateTimeFormat("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "America/Santiago" }).format(d);

const boton =
  "inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 hover:bg-gray-50";

/** Tarjeta de una publicación del muro, con sus acciones. */
export function TarjetaPublicacion({
  p,
  editable,
  completa = false,
  eliminar,
}: {
  p: DatosPublicacion;
  editable: boolean;
  completa?: boolean;
  eliminar?: () => Promise<void>;
}) {
  const base = `/condominios/${p.condominio.id}/muro/${p.id}`;
  const texto = `${p.titulo}\n\n${p.contenido}\n\n— ${p.condominio.nombre}`;
  return (
    <article className="rounded-lg border border-gray-200 border-l-4 border-l-emerald-500 bg-white p-4 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-2 text-gray-700">
          {p.condominio.nombre}
          <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Administración</span>
        </span>
        <time className="text-gray-500" dateTime={p.creadoEn.toISOString()}>
          {fechaLarga(p.creadoEn)}
        </time>
      </div>
      <h3 className="font-semibold uppercase tracking-tight">{p.titulo}</h3>
      <p className={`mt-1 whitespace-pre-line text-sm text-gray-600 ${completa ? "" : "line-clamp-2"}`}>{p.contenido}</p>
      {completa && <p className="mt-3 text-xs text-gray-500">Publicado por {p.autor}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {!completa && (
          <Link href={base} className={boton}>
            <Eye size={15} /> Ver
          </Link>
        )}
        {editable && (
          <Link href={`${base}/editar`} className={boton}>
            <Pencil size={15} /> Editar
          </Link>
        )}
        <a href={`/publicaciones/${p.id}/pdf`} target="_blank" rel="noopener" className={boton}>
          <Download size={15} /> Descargar
        </a>
        <a href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noopener" className={boton}>
          <Share2 size={15} /> Compartir
        </a>
        {editable && eliminar && (
          <BotonConfirmar
            accion={eliminar}
            pregunta={`¿Eliminar la publicación "${p.titulo}"?`}
            className={`${boton} !border-red-200 !text-red-600 hover:!bg-red-50`}
          >
            <Trash2 size={15} /> Eliminar
          </BotonConfirmar>
        )}
      </div>
    </article>
  );
}
