import { iniciarSesion } from "./actions";
import { LoginForm } from "./login-form";
import { PantallaIngreso } from "./pantalla-ingreso";

export default async function LoginAdministracionPage({ searchParams }: PageProps<"/login">) {
  const { listo } = await searchParams;
  return (
    <PantallaIngreso
      titulo="Ingreso de administración"
      descripcion="Para administradores y miembros del comité."
      aviso={listo ? "Tu contraseña quedó actualizada. Ya puedes ingresar." : undefined}
      pie={[
        { texto: "¿Olvidaste tu contraseña?", enlace: "Recupérala aquí", href: "/recuperar" },
        { texto: "¿Eres residente o propietario?", enlace: "Ingreso de residentes", href: "/login/residentes" },
      ]}
    >
      <LoginForm accion={iniciarSesion.bind(null, "ADMIN")} />
    </PantallaIngreso>
  );
}
