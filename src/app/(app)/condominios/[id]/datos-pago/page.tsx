import { notFound } from "next/navigation";
import { CheckCircle2, EyeOff, Landmark } from "lucide-react";
import { db } from "@/lib/db";
import { Card, Insignia, PageHeader } from "@/components/ui";
import { formatoFechaHora } from "@/lib/formato";
import { TIPOS_CUENTA } from "@/lib/cartolas";
import { cuentaPublicable, faltantesCuentaPago, formatoRut } from "@/lib/pagos";
import { puede } from "@/lib/permisos";
import { condominioVisible } from "../condominio-actual";
import { despublicarCuentaPago, guardarDatosPago, verificarCuentaPago } from "../../datos-pago-actions";
import { BotonDespublicar, FormularioDatosPago, FormularioVerificar } from "./formularios";

// PAG-001 · Cobranza → Datos para transferir: la cuenta de la comunidad que ven los residentes al
// pulsar «Pagar». Es la misma cuenta de Conciliación bancaria (FIN-003.1), con sus datos completos.

export default async function DatosPagoPage({ params }: PageProps<"/condominios/[id]/datos-pago">) {
  const { id } = await params;
  const { condominio, usuario, administradoraId } = await condominioVisible(id);
  if (!puede(usuario, "pagos.verificar", id)) notFound();
  const cuentas = await db.cuentaBancaria.findMany({
    where: { condominioId: id, administradoraId, activa: true },
    orderBy: [{ recibePagos: "desc" }, { creadoEn: "asc" }],
  });
  const publicada = cuentas.find(cuentaPublicable);
  const sugerencia = condominio.rut ? { titular: `Comunidad ${condominio.nombre}`, rut: formatoRut(condominio.rut) } : undefined;

  return (
    <>
      <PageHeader titulo="Datos para transferir" descripcion={`${condominio.nombre} · Cuenta bancaria que ven los residentes al pulsar «Pagar».`} />

      <div
        role="status"
        className={`mb-6 flex items-start gap-3 rounded-2xl border p-4 ${publicada ? "border-exito/30 bg-exito-suave" : "border-alerta/40 bg-alerta-suave"}`}
      >
        {publicada ? <CheckCircle2 size={24} aria-hidden="true" className="shrink-0 text-exito" /> : <EyeOff size={24} aria-hidden="true" className="shrink-0 text-alerta" />}
        <p className="text-sm">
          {publicada ? (
            <>
              <strong className="block">Los residentes ven la cuenta {publicada.banco} ···{publicada.numeroFinal}.</strong>
              Verificada por {publicada.verificadaPor} el {formatoFechaHora(publicada.verificadaEn!)}.
            </>
          ) : (
            <>
              <strong className="block">Los residentes todavía no ven datos para transferir.</strong>
              Registra la cuenta de la comunidad, márcala para recibir pagos y verifícala. Mientras tanto, el botón «Pagar» les
              dice que consulten a la administración (nunca muestra datos incompletos).
            </>
          )}
        </p>
      </div>

      <div className="space-y-6">
        {cuentas.map((c) => {
          const faltan = faltantesCuentaPago(c);
          const visible = cuentaPublicable(c);
          return (
            <Card key={c.id}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-lg font-bold">
                  <Landmark size={22} aria-hidden="true" className="text-marca" /> {c.banco} ···{c.numeroFinal}
                  <span className="text-sm font-normal text-texto-suave">{TIPOS_CUENTA[c.tipo as keyof typeof TIPOS_CUENTA] ?? c.tipo}</span>
                </h2>
                {visible ? (
                  <Insignia tono="exito">Publicada a residentes</Insignia>
                ) : c.recibePagos && faltan.length === 0 ? (
                  <Insignia tono="alerta">Falta verificar</Insignia>
                ) : c.recibePagos ? (
                  <Insignia tono="alerta">Datos incompletos</Insignia>
                ) : (
                  <Insignia>Solo cartolas</Insignia>
                )}
              </div>
              <FormularioDatosPago accion={guardarDatosPago.bind(null, id, c.id)} cuenta={c} sugerencia={sugerencia} />
              {c.recibePagos && faltan.length === 0 && (
                <div className="mt-5 border-t border-borde pt-4">
                  {visible ? (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm">
                        Titular {c.titular} · RUT {formatoRut(c.rutTitular!)} · verificada por {c.verificadaPor}.
                      </p>
                      <BotonDespublicar accion={despublicarCuentaPago.bind(null, id, c.id)} />
                    </div>
                  ) : (
                    <FormularioVerificar accion={verificarCuentaPago.bind(null, id, c.id)} />
                  )}
                </div>
              )}
            </Card>
          );
        })}

        {cuentas.length === 0 ? (
          <Card>
            <h2 className="mb-1 text-lg font-bold">Registra la cuenta de la comunidad</h2>
            <p className="mb-4 text-sm text-texto-suave">La misma cuenta se usa para cargar sus cartolas en Conciliación bancaria.</p>
            <FormularioDatosPago accion={guardarDatosPago.bind(null, id, null)} sugerencia={sugerencia} />
          </Card>
        ) : (
          <details className="rounded-2xl border border-borde bg-white p-4">
            <summary className="cursor-pointer text-sm font-semibold text-marca">Registrar otra cuenta</summary>
            <div className="mt-4">
              <FormularioDatosPago accion={guardarDatosPago.bind(null, id, null)} sugerencia={sugerencia} />
            </div>
          </details>
        )}
      </div>
    </>
  );
}
