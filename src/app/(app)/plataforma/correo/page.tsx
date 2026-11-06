import { requirePermiso } from "@/lib/auth";
import { configuracionCorreo } from "@/lib/correo";
import { NOMBRE_PROVEEDOR } from "@/lib/correo-proveedores";
import { Card, Insignia, PageHeader } from "@/components/ui";
import { enviarCorreoPrueba } from "./actions";
import { PruebaCorreoForm } from "./prueba-form";

export default async function CorreoPlataformaPage() {
  const usuario = await requirePermiso("plataforma");
  const config = configuracionCorreo();
  const real = config.proveedor !== "PRUEBA";

  return (
    <>
      <PageHeader
        titulo="Correo"
        descripcion="Servicio que envía los avisos de cobro, las invitaciones a residentes y los enlaces para recuperar la contraseña."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-texto-suave">Servicio</dt>
              <dd className="mt-1 flex items-center gap-2 font-semibold">
                {NOMBRE_PROVEEDOR[config.proveedor]}
                <Insignia tono={real ? "exito" : "alerta"}>{real ? "Activo" : "Sin configurar"}</Insignia>
              </dd>
            </div>
            <div>
              <dt className="text-texto-suave">Remitente</dt>
              <dd className="mt-1 break-all font-semibold">{config.remitente}</dd>
            </div>
            {config.responderA && (
              <div>
                <dt className="text-texto-suave">Las respuestas llegan a</dt>
                <dd className="mt-1 break-all font-semibold">{config.responderA}</dd>
              </div>
            )}
          </dl>
          {!real && (
            <p className="mt-4 rounded-lg bg-alerta-suave px-3 py-2 text-sm text-alerta">
              Agrega BREVO_API_KEY (o RESEND_API_KEY) y CORREO_REMITENTE en las variables de Vercel y vuelve a
              desplegar. Mientras tanto, los correos no salen.
            </p>
          )}
        </Card>
        <Card>
          <PruebaCorreoForm accion={enviarCorreoPrueba} correo={usuario.correo} />
        </Card>
      </div>
    </>
  );
}
