import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePermiso } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { formatoMoneda, hoyChile } from "@/lib/formato";
import { conUnidad } from "../../../datos-residente";
import { avisoDeUnidad, cuentaDeUnidad, unidadAPagar } from "../datos";
import { informarTransferenciaAccion } from "../actions";
import { FormularioInforme } from "./formulario";

// PAG-001 · «Ya realicé la transferencia».

export default async function InformarPage({ searchParams }: PageProps<"/mi-cuenta/pagar/informar">) {
  const usuario = await requirePermiso("portal.residente");
  const sp = await searchParams;
  const { unidad } = await unidadAPagar(usuario, sp.unidad);
  if (!unidad) redirect("/mi-cuenta/pagar");
  const [datos, escaneado] = await Promise.all([cuentaDeUnidad(usuario, unidad), avisoDeUnidad(unidad.id, sp.aviso)]);
  const moneda = usuario.administradora?.moneda ?? "CLP";

  return (
    <>
      <Link href={conUnidad("/mi-cuenta/pagar", unidad.id)} className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-marca">
        <ArrowLeft size={16} aria-hidden="true" /> Volver a mi saldo
      </Link>
      <PageHeader titulo="Informar transferencia" descripcion={`${unidad.condominioNombre} · ${unidad.nombre} · Saldo actual ${formatoMoneda(datos.estado.deuda, moneda)}`} />
      <Card className="max-w-2xl">
        <FormularioInforme
          accion={informarTransferenciaAccion}
          unidadId={unidad.id}
          avisoId={escaneado?.id}
          montoSugerido={datos.estado.deuda}
          hoy={hoyChile()}
        />
      </Card>
    </>
  );
}
