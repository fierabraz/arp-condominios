import { iniciarSesion } from "../actions";
import { LoginForm } from "../login-form";
import { PantallaIngreso } from "../pantalla-ingreso";

export default async function LoginResidentesPage({ searchParams }: PageProps<"/login/residentes">) {
  const { listo } = await searchParams;
  return (
    <PantallaIngreso
      publico="residentes"
      titulo="Ingreso de residentes"
      descripcion="Revisa tus cobros, tus pagos, los avisos y las votaciones de tu comunidad."
      aviso={listo ? "Tu contraseña quedó actualizada. Ya puedes ingresar." : undefined}
      pie={[
        { texto: "¿Olvidaste tu contraseña?", enlace: "Recupérala aquí", href: "/recuperar?residente=1" },
        { texto: "¿Administras un edificio?", enlace: "Ingreso de administración", href: "/login" },
      ]}
    >
      <LoginForm accion={iniciarSesion.bind(null, "RESIDENTE")} />
    </PantallaIngreso>
  );
}
