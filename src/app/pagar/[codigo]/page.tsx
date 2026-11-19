import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { QrCode } from "lucide-react";
import { db } from "@/lib/db";
import { getUsuarioActual, puedeVerPropiedad } from "@/lib/auth";
import { puedeVerUnidad } from "@/lib/acceso";
import { nombrePeriodo } from "@/lib/cobro";
import { CODIGO_PAGO } from "@/lib/pagos";
import { BotonLink } from "@/components/ui";
import { PantallaIngreso } from "@/app/login/pantalla-ingreso";

// PAG-001 · Destino del QR y del enlace del aviso de cobro.
// - Sin sesión: solo el nombre de la comunidad y el mes del aviso, y el botón para ingresar.
//   Ningún monto, unidad, nombre ni RUT: el enlace puede reenviarse o fotografiarse.
// - Residente de esa unidad: su página de pago con ese aviso destacado.
// - Administración con acceso a la comunidad: la ficha de la unidad.
// - Cualquier otra cuenta: «no corresponde», sin datos.

export const metadata: Metadata = { title: "Pagar gastos comunes", robots: { index: false, follow: false } };

export default async function PagarCodigoPage({ params }: PageProps<"/pagar/[codigo]">) {
  const { codigo } = await params;
  if (!CODIGO_PAGO.test(codigo)) notFound();
  const aviso = await db.avisoCobro.findUnique({
    where: { codigoPago: codigo },
    select: {
      id: true,
      unidadId: true,
      administradoraId: true,
      periodo: { select: { anio: true, mes: true } },
      unidad: { select: { condominioId: true, condominio: { select: { nombre: true } } } },
    },
  });
  if (!aviso) notFound();
  const usuario = await getUsuarioActual();
  const mes = nombrePeriodo(aviso.periodo.anio, aviso.periodo.mes).toLowerCase();

  if (usuario && usuario.administradoraId === aviso.administradoraId) {
    if (usuario.rol === "RESIDENTE" && (await puedeVerUnidad(usuario, aviso.unidadId))) {
      redirect(`/mi-cuenta/pagar?unidad=${aviso.unidadId}&aviso=${aviso.id}`);
    }
    if (usuario.rol !== "RESIDENTE" && puedeVerPropiedad(usuario, aviso.unidad.condominioId)) {
      redirect(`/condominios/${aviso.unidad.condominioId}/unidades/${aviso.unidadId}`);
    }
  }

  if (usuario) {
    return (
      <PantallaIngreso publico="residentes" titulo="Este aviso no corresponde a tu cuenta" descripcion="El enlace es de una unidad que no está vinculada a la cuenta con la que ingresaste.">
        <BotonLink href={usuario.rol === "RESIDENTE" ? "/mi-cuenta" : "/"} className="w-full">
          Ir a mi inicio
        </BotonLink>
      </PantallaIngreso>
    );
  }

  return (
    <PantallaIngreso
      publico="residentes"
      titulo="Pagar gastos comunes"
      descripcion={`${aviso.unidad.condominio.nombre} · aviso de ${mes}`}
      pie={[{ texto: "¿Aún no tienes cuenta?", enlace: "Pídele la invitación a tu administración", href: "/login/residentes" }]}
    >
      <p className="mb-4 flex items-start gap-2 text-sm text-texto">
        <QrCode size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-marca" />
        Para proteger tus datos, el saldo, los datos para transferir y el estado de tus pagos solo se muestran después de ingresar.
      </p>
      <BotonLink href={`/login/residentes?volver=${encodeURIComponent(`/pagar/${codigo}`)}`} className="w-full">
        Ingresar para ver y pagar
      </BotonLink>
    </PantallaIngreso>
  );
}
