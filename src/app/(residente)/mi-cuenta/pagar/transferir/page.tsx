import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Info, Send } from "lucide-react";
import { requirePermiso } from "@/lib/auth";
import { BotonLink, Card, PageHeader } from "@/components/ui";
import { BotonCopiar } from "@/components/boton-copiar";
import { formatoMoneda } from "@/lib/formato";
import { TIPOS_CUENTA } from "@/lib/cartolas";
import { formatoRut, referenciaSugerida } from "@/lib/pagos";
import { cuentaParaPagos } from "@/lib/transferencias-servicio";
import { conUnidad } from "../../../datos-residente";
import { avisoDeUnidad, cuentaDeUnidad, unidadAPagar } from "../datos";

// PAG-001 · Botón «Pagar» (primera etapa): datos de la cuenta de la comunidad para transferir
// desde el banco del residente. Convive no ejecuta ni recibe la transferencia.

export default async function TransferirPage({ searchParams }: PageProps<"/mi-cuenta/pagar/transferir">) {
  const usuario = await requirePermiso("portal.residente");
  const sp = await searchParams;
  const { unidad } = await unidadAPagar(usuario, sp.unidad);
  if (!unidad) redirect("/mi-cuenta/pagar");
  const moneda = usuario.administradora?.moneda ?? "CLP";
  const [cuentaBanco, datos, escaneado] = await Promise.all([
    cuentaParaPagos(unidad.condominioId, usuario.administradoraId!),
    cuentaDeUnidad(usuario, unidad),
    avisoDeUnidad(unidad.id, sp.aviso),
  ]);
  const volver = conUnidad(escaneado ? `/mi-cuenta/pagar?aviso=${escaneado.id}` : "/mi-cuenta/pagar", unidad.id);
  const informar = conUnidad(escaneado ? `/mi-cuenta/pagar/informar?aviso=${escaneado.id}` : "/mi-cuenta/pagar/informar", unidad.id);
  const monto = datos.estado.deuda;
  // La referencia nombra el período del aviso escaneado o, si no, el del aviso pendiente más reciente.
  const ultimo = escaneado?.periodo ?? datos.pendientes.at(-1)?.periodo ?? null;
  const referencia = referenciaSugerida(datos.numero, ultimo);

  return (
    <>
      <Link href={volver} className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-marca">
        <ArrowLeft size={16} aria-hidden="true" /> Volver a mi saldo
      </Link>
      <PageHeader titulo="Pagar por transferencia" descripcion={`${unidad.condominioNombre} · ${unidad.nombre}`} />

      {!cuentaBanco ? (
        <Card className="max-w-2xl">
          <p className="mb-2 flex items-center gap-2 font-bold">
            <Info size={20} aria-hidden="true" className="text-alerta" /> Datos para transferir no disponibles
          </p>
          <p className="text-sm">
            Tu comunidad todavía no tiene publicados y verificados en Convive los datos de su cuenta bancaria. Consulta a tu
            administración cómo pagar. Por seguridad, Convive no muestra datos incompletos.
          </p>
        </Card>
      ) : (
        <div className="grid max-w-4xl gap-6 lg:grid-cols-[1.3fr_1fr]">
          <Card>
            <h2 className="mb-1 text-lg font-bold">Datos de la cuenta de la comunidad</h2>
            <p className="mb-4 text-sm text-texto-suave">Cópialos en la app o sitio de tu banco.</p>
            <dl className="divide-y divide-borde">
              {[
                { etiqueta: "Banco", valor: cuentaBanco.banco },
                { etiqueta: "Titular", valor: cuentaBanco.titular! },
                { etiqueta: "RUT del titular", valor: formatoRut(cuentaBanco.rutTitular!), copiar: formatoRut(cuentaBanco.rutTitular!) },
                { etiqueta: "Tipo de cuenta", valor: TIPOS_CUENTA[cuentaBanco.tipo as keyof typeof TIPOS_CUENTA] ?? cuentaBanco.tipo },
                { etiqueta: "Número de cuenta", valor: cuentaBanco.numeroCuenta!, copiar: cuentaBanco.numeroCuenta! },
                ...(cuentaBanco.correoPagos ? [{ etiqueta: "Correo para el comprobante", valor: cuentaBanco.correoPagos, copiar: cuentaBanco.correoPagos }] : []),
              ].map((f) => (
                <div key={f.etiqueta} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <dt className="text-xs text-texto-suave">{f.etiqueta}</dt>
                    <dd className="break-words font-semibold">{f.valor}</dd>
                  </div>
                  {"copiar" in f && f.copiar && <BotonCopiar valor={f.copiar} etiqueta={f.etiqueta.toLowerCase()} />}
                </div>
              ))}
            </dl>
          </Card>
          <div className="space-y-4">
            <Card className="bg-convive-suave/60">
              <dl className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <dt className="text-xs text-texto-suave">Monto adeudado</dt>
                    <dd className="text-2xl font-bold tabular-nums text-convive-oscuro">{formatoMoneda(monto, moneda)}</dd>
                  </div>
                  {monto > 0 && <BotonCopiar valor={String(Math.round(monto))} etiqueta="monto" />}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <dt className="text-xs text-texto-suave">Referencia sugerida (comentario de la transferencia)</dt>
                    <dd className="font-mono font-semibold">{referencia}</dd>
                  </div>
                  <BotonCopiar valor={referencia} etiqueta="referencia" />
                </div>
              </dl>
              <p className="mt-3 text-xs text-texto-suave">
                Puedes pagar un monto distinto (un abono o varios meses). Lo que pagues se aplica primero a la deuda más antigua
                cuando la administración lo verifique.
              </p>
            </Card>
            <Card>
              <h2 className="mb-2 font-bold">Cómo pagar</h2>
              <ol className="list-decimal space-y-1 pl-5 text-sm">
                <li>Entra a tu banco y haz la transferencia con estos datos.</li>
                <li>Escribe la referencia sugerida en el comentario.</li>
                <li>Vuelve a Convive y pulsa «Ya realicé la transferencia».</li>
              </ol>
              <p className="mt-3 text-xs text-texto-suave">
                Convive no realiza ni recibe el pago: solo te muestra los datos de tu comunidad.
              </p>
              <BotonLink href={informar} className="mt-4 w-full">
                <Send size={18} aria-hidden="true" /> Ya realicé la transferencia
              </BotonLink>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
