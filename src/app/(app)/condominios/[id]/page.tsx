import Link from "next/link";
import {
  Banknote,
  BotMessageSquare,
  Library,
  Mail,
  Pencil,
  Plus,
  Scale,
  Tally4,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { db } from "@/lib/db";
import { Vacio } from "@/components/ui";
import { TarjetaPropiedad } from "@/components/tarjeta-propiedad";
import { TarjetaPublicacion } from "@/components/publicacion";
import { resumenPropiedades } from "@/lib/resumen-propiedades";
import { eliminarPublicacion } from "../muro-actions";
import { condominioVisible } from "./condominio-actual";

export default async function PanelPropiedadPage({ params }: PageProps<"/condominios/[id]">) {
  const { id } = await params;
  const { condominio, editable, administradoraId } = await condominioVisible(id);
  const [[resumen], publicaciones] = await Promise.all([
    resumenPropiedades(administradoraId, [id]),
    db.publicacion.findMany({
      where: { condominioId: id },
      orderBy: { creadoEn: "desc" },
      take: 3,
      include: { condominio: { select: { id: true, nombre: true } } },
    }),
  ]);
  const base = `/condominios/${id}`;

  const accesos: { texto: string; href: string; icono: LucideIcon; admin?: boolean }[] = [
    { texto: "Configurar propiedad", href: `${base}/editar`, icono: Pencil, admin: true },
    { texto: "Asistente administrativo", href: `${base}/modulo/asistente`, icono: BotMessageSquare },
    { texto: "Conciliación bancaria", href: `${base}/modulo/conciliacion`, icono: Scale },
    { texto: "Fondos", href: `${base}/fondos`, icono: Tally4 },
    { texto: "Registro de correos", href: `${base}/correos`, icono: Mail },
    { texto: "Nuevo pago", href: `${base}/pagos`, icono: Plus, admin: true },
    { texto: "Nuevo residente", href: `${base}/unidades`, icono: UserPlus, admin: true },
    { texto: "Pago en línea", href: `${base}/modulo/pago-en-linea`, icono: Banknote },
  ];

  return (
    <>
      <div className="mb-6 overflow-hidden rounded-xl border border-gray-200 shadow-sm">
        <TarjetaPropiedad p={resumen} conBoton={false} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-100 px-4 py-3">
            <h2 className="text-xl font-medium text-emerald-700">Muro de la comunidad</h2>
            <div className="flex flex-wrap gap-2 text-sm">
              <Link href={`${base}/rendiciones`} className="inline-flex items-center gap-1 rounded bg-amber-400 px-2 py-1 font-medium text-white hover:bg-amber-500">
                <Library size={14} /> Biblioteca
              </Link>
              <Link href={`${base}/muro`} className="rounded border border-gray-300 bg-white px-2 py-1 hover:bg-gray-50">
                Ver todas las publicaciones
              </Link>
              {editable && (
                <Link href={`${base}/muro/nueva`} className="inline-flex items-center gap-1 rounded bg-emerald-500 px-2 py-1 font-medium text-white hover:bg-emerald-600">
                  <Pencil size={14} /> Crear publicación
                </Link>
              )}
            </div>
          </div>
          {publicaciones.length === 0 ? (
            <Vacio>
              Aún no hay publicaciones. {editable && "Usa “Crear publicación” para avisar algo a los residentes."}
            </Vacio>
          ) : (
            <div className="space-y-3">
              {publicaciones.map((p) => (
                <TarjetaPublicacion key={p.id} p={p} editable={editable} eliminar={eliminarPublicacion.bind(null, p.id)} />
              ))}
            </div>
          )}
        </section>

        <section aria-label="Accesos rápidos" className="grid content-start gap-2 sm:grid-cols-2">
          {accesos
            .filter((a) => editable || !a.admin)
            .map((a) => (
              <Link
                key={a.texto}
                href={a.href}
                className="flex items-center justify-center gap-2 rounded-md bg-emerald-500 px-3 py-2.5 text-sm font-medium text-white hover:bg-emerald-600"
              >
                <a.icono size={16} /> {a.texto}
              </Link>
            ))}
        </section>
      </div>
      <p className="sr-only">{condominio.nombre}</p>
    </>
  );
}
