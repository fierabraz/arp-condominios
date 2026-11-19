import { PantallaIngreso } from "@/app/login/pantalla-ingreso";
import { BotonLink } from "@/components/ui";
import { tokenVigente } from "@/lib/recuperacion";
import { LOGIN, tipoDeRol } from "@/lib/session";
import { confirmarMiCorreo } from "@/app/crear-cuenta/actions";
import { ConfirmarCorreoForm } from "@/app/crear-cuenta/formularios";

// PILOTO-001: confirmar el correo. Se confirma con un botón (no al abrir el enlace), para que
// los revisores automáticos de correo no lo hagan solos.
export default async function VerificarPage({ params }: PageProps<"/verificar/[token]">) {
  const { token } = await params;
  const t = await tokenVigente(token, "VERIFICACION");
  if (!t) {
    return (
      <PantallaIngreso
        titulo="Este enlace ya no sirve"
        descripcion="Los enlaces de confirmación sirven una sola vez y vencen a las 48 horas. Ingresa con tu correo y contraseña: si aún falta confirmar, te enviaremos uno nuevo."
      >
        <div className="grid gap-3">
          <BotonLink href={LOGIN.RESIDENTE}>Ingreso de residentes</BotonLink>
          <BotonLink href={LOGIN.ADMIN} variante="secundario">
            Ingreso de administración
          </BotonLink>
        </div>
      </PantallaIngreso>
    );
  }
  const residente = tipoDeRol(t.usuario.rol) === "RESIDENTE";
  return (
    <PantallaIngreso
      publico={residente ? "residentes" : "administracion"}
      titulo={`Hola, ${t.usuario.nombre.split(" ")[0]}`}
      descripcion={`Confirma que ${t.usuario.correo} es tu correo para activar tu cuenta.`}
    >
      <ConfirmarCorreoForm accion={confirmarMiCorreo.bind(null, token)} />
    </PantallaIngreso>
  );
}
