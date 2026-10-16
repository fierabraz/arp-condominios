import { notFound } from "next/navigation";
import { Construction } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { moduloPorClave } from "@/lib/modulos";
import { condominioVisible } from "../../condominio-actual";

export default async function ModuloProximoPage({ params }: PageProps<"/condominios/[id]/modulo/[clave]">) {
  const { id, clave } = await params;
  const { condominio } = await condominioVisible(id);
  const modulo = moduloPorClave(clave);
  if (!modulo || modulo.ruta) notFound();
  return (
    <>
      <PageHeader titulo={modulo.texto} descripcion={condominio.nombre} />
      <Card className="flex items-start gap-4">
        <Construction className="mt-1 shrink-0 text-amber-500" size={28} />
        <div>
          <p className="font-medium">Este módulo viene pronto.</p>
          <p className="mt-1 text-texto-suave">{modulo.descripcion}</p>
        </div>
      </Card>
    </>
  );
}
