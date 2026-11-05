import { PantallaIngreso } from "@/app/login/pantalla-ingreso";
import { solicitarRecuperacion } from "./actions";
import { SolicitudForm } from "./formularios";

export default async function RecuperarPage({ searchParams }: PageProps<"/recuperar">) {
  const { residente } = await searchParams;
  const volver = residente ? "/login/residentes" : "/login";
  return (
    <PantallaIngreso
      publico={residente ? "residentes" : "administracion"}
      titulo="Recuperar contraseña"
      descripcion="Escribe el correo de tu cuenta y te enviaremos un enlace para crear una contraseña nueva."
      pie={[{ texto: "¿La recordaste?", enlace: "Volver a ingresar", href: volver }]}
    >
      <SolicitudForm accion={solicitarRecuperacion} />
    </PantallaIngreso>
  );
}
