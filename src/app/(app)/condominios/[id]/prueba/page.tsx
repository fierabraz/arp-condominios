import Link from "next/link";
import { notFound } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { db } from "@/lib/db";
import { BotonDocumento, Card, PageHeader } from "@/components/ui";
import { puede } from "@/lib/permisos";
import { demoPermitida } from "@/lib/demo-financiera";
import { condominioVisible } from "../condominio-actual";
import { claveResidenteDemoAccion } from "../../prueba-actions";
import { ClaveResidente } from "./clave";

// FIN-COMP · Guía del recorrido de prueba (Entrega A) para la comunidad ficticia.

export default async function PruebaPage({ params }: PageProps<"/condominios/[id]/prueba">) {
  const { id } = await params;
  const { condominio, usuario } = await condominioVisible(id);
  if (!condominio.demo || !demoPermitida() || !puede(usuario, "pagos.verificar", id)) notFound();
  const base = `/condominios/${id}`;
  const residente = await db.usuario.findFirst({
    where: { rol: "RESIDENTE", persona: { unidades: { some: { unidad: { condominioId: id } } } } },
    select: { correo: true },
  });
  const paso = (n: number, texto: React.ReactNode) => (
    <li className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-convive-suave text-sm font-bold text-convive-oscuro">{n}</span>
      <span className="pt-0.5">{texto}</span>
    </li>
  );
  const enlace = (href: string, texto: string) => (
    <Link href={href} className="font-semibold text-marca underline">
      {texto}
    </Link>
  );

  return (
    <>
      <PageHeader
        titulo="Recorrido de prueba: pagos y conciliación"
        descripcion={`${condominio.nombre} · Comunidad FICTICIA (solo existe en la vista previa). Todos los datos son inventados.`}
      />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <h2 className="mb-3 flex items-center gap-2 font-bold">
            <FlaskConical size={20} aria-hidden="true" /> Pasos
          </h2>
          <p className="mb-4 text-sm text-texto-suave">
            Ya están hechos los pasos 1 a 7: comunidad con 8 unidades y personas ficticias, gastos del mes anterior, avisos emitidos (con QR) y cuenta bancaria
            verificada. Puedes revisarlos en {enlace(`${base}/unidades`, "Unidades")}, {enlace(`${base}/periodos`, "Gastos comunes")} y{" "}
            {enlace(`${base}/datos-pago`, "Datos para transferir")}.
          </p>
          <ol className="space-y-3 text-sm">
            {paso(1, <>Genera la clave del residente ficticio (a la derecha) y entra como residente en una <strong>ventana privada</strong>.</>)}
            {paso(2, <>Como residente: abre <strong>Pagar gastos comunes</strong>. Debe deber $105.000.</>)}
            {paso(3, <>Pulsa <strong>Ya realicé la transferencia</strong> e informa <strong>$50.000</strong> con la fecha de hoy.</>)}
            {paso(4, <>Verás «Pago pendiente de verificación» y la deuda sigue en $105.000. Sal de la cuenta, vuelve a entrar: sigue igual.</>)}
            {paso(5, <>Como administración: en {enlace(`${base}/conciliacion`, "Conciliación bancaria")} carga la <strong>cartola 1</strong>. La transferencia sigue pendiente (no aparece en la cartola).</>)}
            {paso(6, <>Carga la <strong>cartola 2</strong>. Convive dice que 5 movimientos ya estaban registrados y agrega solo 1 nuevo: el de $50.000.</>)}
            {paso(7, <>En {enlace(`${base}/transferencias`, "Transferencias informadas")} abre la de $50.000, elige el movimiento sugerido, revisa qué aviso paga y confirma.</>)}
            {paso(8, <>Como residente: la deuda ahora es $55.000 y la transferencia dice «Verificado y conciliado». En {enlace(`${base}/pagos`, "Recaudación")} hay un solo pago de $50.000.</>)}
            {paso(9, <>Vuelve a cargar la cartola 2: no se agrega nada (ya estaba importada) y no aparece otro pago.</>)}
            {paso(10, <>Otros casos: en {enlace(`${base}/conciliacion/movimientos?tipo=abono`, "Movimientos")} concilia el abono de la unidad 102 (Convive la sugiere), registra los intereses como «otro ingreso», y prueba «Reversar este pago» en la transferencia.</>)}
          </ol>
        </Card>
        <div className="space-y-6">
          <Card>
            <h2 className="mb-2 font-bold">Residente ficticio (unidad 101)</h2>
            <p className="mb-3 text-sm text-texto-suave">{residente?.correo ?? "—"} · correo de ejemplo que no recibe mensajes.</p>
            <ClaveResidente accion={claveResidenteDemoAccion.bind(null, id)} />
          </Card>
          <Card>
            <h2 className="mb-2 font-bold">Cartolas ficticias</h2>
            <p className="mb-3 text-sm text-texto-suave">Se generan con fechas de estos días. La 2 repite las filas de la 1 y agrega el abono de $50.000.</p>
            <div className="flex flex-wrap gap-2">
              <BotonDocumento href={`${base}/prueba/cartola?n=1`} target="_self">
                Cartola 1 (sin la transferencia)
              </BotonDocumento>
              <BotonDocumento href={`${base}/prueba/cartola?n=2`} target="_self">
                Cartola 2 (con la transferencia)
              </BotonDocumento>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
