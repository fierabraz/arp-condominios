import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePermiso } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { formatoMoneda, hoyChile } from "@/lib/formato";
import { MENSAJE_PAGO_PENDIENTE } from "@/lib/pagos";
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
      {datos.enVerificacion.cantidad > 0 && (
        <div role="note" className="mb-4 max-w-2xl rounded-2xl border border-alerta/40 bg-alerta-suave/60 p-4 text-sm">
          <p className="font-bold">
            Ya tienes {datos.enVerificacion.cantidad === 1 ? "un pago pendiente" : `${datos.enVerificacion.cantidad} pagos pendientes`} de verificación por{" "}
            {formatoMoneda(datos.enVerificacion.monto, moneda)}.
          </p>
          <p className="mt-1">{MENSAJE_PAGO_PENDIENTE}</p>
          <p className="mt-1">No es necesario volver a informarlo ni volver a transferir. Informa aquí solo una transferencia distinta.</p>
        </div>
      )}
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
