import { iniciarSesion } from "../actions";
import { LoginForm } from "../login-form";
import { PantallaIngreso } from "../pantalla-ingreso";
import { volverPermitido } from "@/lib/pagos";

export default async function LoginResidentesPage({ searchParams }: PageProps<"/login/residentes">) {
  const { listo, volver } = await searchParams;
  const destino = volverPermitido(volver);
  return (
    <PantallaIngreso
      publico="residentes"
      titulo="Ingreso de residentes"
      descripcion="Revisa tus cobros, tus pagos, los avisos y las votaciones de tu comunidad."
      aviso={
        listo
          ? "Tu contraseña quedó actualizada. Ya puedes ingresar."
          : destino
            ? "Ingresa para ver el saldo de tu aviso y los datos para transferir."
            : undefined
      }
      pie={[
        { texto: "¿Olvidaste tu contraseña?", enlace: "Recupérala aquí", href: "/recuperar?residente=1" },
        { texto: "¿Administras un edificio?", enlace: "Ingreso de administración", href: "/login" },
      ]}
    >
      <LoginForm accion={iniciarSesion.bind(null, "RESIDENTE")} volver={destino} />
    </PantallaIngreso>
  );
}
