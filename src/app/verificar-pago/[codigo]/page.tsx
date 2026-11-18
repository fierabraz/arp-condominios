import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { consultaPublicaConstancia } from "@/lib/constancias-servicio";
import { codigoDocumento, diferenciaMontos, ESTADO_CONSTANCIA, formatoFolio } from "@/lib/constancias";
import { formatoFecha, formatoFechaHora, formatoMoneda } from "@/lib/formato";
import { PantallaIngreso } from "@/app/login/pantalla-ingreso";

// PILOTO-001 · Destino del QR de la constancia de pago. Sin sesión. Muestra solo lo necesario para
// comprobar que el documento es auténtico y su estado vigente: folio, comunidad, estado, montos,
// fecha y versiones (con su código). Nunca nombres, RUT, unidad, cuenta ni referencia bancaria.

export const metadata: Metadata = { title: "Verificar constancia de pago", robots: { index: false, follow: false } };

export default async function VerificarPagoPage({ params }: PageProps<"/verificar-pago/[codigo]">) {
  const { codigo } = await params;
  const c = await consultaPublicaConstancia(codigo);
  if (!c) notFound();
  const estado = ESTADO_CONSTANCIA[c.estado];
  const m = (n: number) => formatoMoneda(n, c.moneda);
  const dif = diferenciaMontos(c);
  return (
    <PantallaIngreso publico="residentes" titulo={`Constancia ${formatoFolio(c.folio)}`} descripcion={c.comunidad}>
      <p className="mb-3 flex items-center gap-2 text-sm text-texto-suave">
        <ShieldCheck size={18} aria-hidden="true" className="text-marca" /> Documento emitido por Convive. Estado vigente:
      </p>
      <p className="mb-3 rounded-lg px-3 py-2 text-center font-bold text-white" style={{ backgroundColor: estado.color }}>
        {estado.titulo}
      </p>
      <p className="mb-4 text-sm text-texto">{estado.aviso}</p>
      <dl className="mb-4 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <dt className="text-texto-suave">Fecha de la transferencia</dt>
        <dd>{formatoFecha(new Date(`${c.fechaTransferencia}T00:00:00Z`))}</dd>
        <dt className="text-texto-suave">Monto informado</dt>
        <dd>{m(c.montoInformado)}</dd>
        {c.montoConfirmado !== null && (
          <>
            <dt className="text-texto-suave">Monto confirmado</dt>
            <dd className="font-semibold">{m(c.montoConfirmado)}</dd>
          </>
        )}
        {dif !== null && (
          <>
            <dt className="text-texto-suave">Diferencia</dt>
            <dd>{m(dif)}</dd>
          </>
        )}
      </dl>
      <h2 className="mb-1 text-sm font-bold">Versiones emitidas</h2>
      <ul className="mb-3 space-y-1 text-xs text-texto-suave">
        {c.versiones.map((v) => (
          <li key={v.version}>
            Versión {v.version}: {ESTADO_CONSTANCIA[v.estado].titulo.toLowerCase()} · {formatoFechaHora(v.generadaEn)} · código {codigoDocumento(v.huella)}
          </li>
        ))}
      </ul>
      <p className="text-xs text-texto-suave">
        Si el código impreso en tu documento no aparece en esta lista, el documento no fue emitido por Convive. Si aparece pero no es la última versión, el estado
        vigente es el que se muestra arriba.
      </p>
    </PantallaIngreso>
  );
}
