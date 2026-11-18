import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { consultaPublicaCertificado } from "@/lib/certificados-servicio";
import { formatoFolioCertificado } from "@/lib/certificados";
import { codigoDocumento } from "@/lib/constancias";
import { formatoFechaHora } from "@/lib/formato";
import { PantallaIngreso } from "@/app/login/pantalla-ingreso";

// PILOTO-001 · Destino del QR del certificado de unidad al día. Sin sesión y sin datos personales.

export const metadata: Metadata = { title: "Verificar certificado", robots: { index: false, follow: false } };

export default async function VerificarCertificadoPage({ params }: PageProps<"/verificar-certificado/[codigo]">) {
  const { codigo } = await params;
  const c = await consultaPublicaCertificado(codigo);
  if (!c) notFound();
  return (
    <PantallaIngreso publico="residentes" titulo={`Certificado ${formatoFolioCertificado(c.folio)}`} descripcion={c.comunidad}>
      <p className="mb-3 flex items-center gap-2 font-semibold text-exito">
        <ShieldCheck size={20} aria-hidden="true" /> Certificado auténtico emitido por Convive
      </p>
      <dl className="mb-4 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <dt className="text-texto-suave">Unidad</dt>
        <dd>{c.unidad}</dd>
        <dt className="text-texto-suave">Emitido el</dt>
        <dd>{formatoFechaHora(c.emitidoEn)}</dd>
        <dt className="text-texto-suave">Código del documento</dt>
        <dd>{codigoDocumento(c.huella)}</dd>
      </dl>
      <p className="text-xs text-texto-suave">
        Certifica que, a la fecha y hora de emisión, la unidad no tenía obligaciones vencidas impagas. No informa la situación posterior a esa fecha.
      </p>
    </PantallaIngreso>
  );
}
