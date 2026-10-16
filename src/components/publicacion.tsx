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
  "inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3 text-sm font-semibold text-texto hover:bg-fondo";

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
    <article className="rounded-2xl border border-borde bg-white p-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-2 text-texto">
          {p.condominio.nombre}
          <span className="rounded-full bg-marca-suave px-2.5 py-0.5 text-xs font-bold text-marca">Administración</span>
        </span>
        <time className="text-texto-suave" dateTime={p.creadoEn.toISOString()}>
          {fechaLarga(p.creadoEn)}
        </time>
      </div>
      <h3 className="text-lg font-bold">{p.titulo}</h3>
      <p className={`mt-1 whitespace-pre-line text-texto-suave ${completa ? "" : "line-clamp-2"}`}>{p.contenido}</p>
      {completa && <p className="mt-3 text-xs text-texto-suave">Publicado por {p.autor}</p>}
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
            className={`${boton} !border-peligro-suave !text-peligro hover:!bg-peligro-suave`}
          >
            <Trash2 size={15} /> Eliminar
          </BotonConfirmar>
        )}
      </div>
    </article>
  );
}
