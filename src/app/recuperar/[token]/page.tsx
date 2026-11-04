import { PantallaIngreso } from "@/app/login/pantalla-ingreso";
import { BotonLink } from "@/components/ui";
import { tokenVigente } from "@/lib/recuperacion";
import { crearClaveNueva } from "../actions";
import { ClaveNuevaForm } from "../formularios";

export default async function ClaveNuevaPage({ params }: PageProps<"/recuperar/[token]">) {
  const { token } = await params;
  const t = await tokenVigente(token);
  if (!t) {
    return (
      <PantallaIngreso titulo="El enlace ya no sirve" descripcion="Los enlaces sirven una sola vez y vencen en una hora.">
        <BotonLink href="/recuperar" className="w-full">
          Pedir un enlace nuevo
        </BotonLink>
      </PantallaIngreso>
    );
  }
  return (
    <PantallaIngreso titulo="Crea tu contraseña nueva" descripcion={`Cuenta: ${t.usuario.correo}`}>
      <ClaveNuevaForm accion={crearClaveNueva.bind(null, token)} />
    </PantallaIngreso>
  );
}
