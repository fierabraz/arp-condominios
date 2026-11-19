import { PantallaIngreso } from "@/app/login/pantalla-ingreso";
import { crearCuentaAdministracion } from "../actions";
import { RegistroAdministracionForm } from "../formularios";

export default async function CrearCuentaAdministracionPage({ searchParams }: PageProps<"/crear-cuenta/administracion">) {
  const { codigo } = await searchParams;
  return (
    <PantallaIngreso
      titulo="Crear cuenta de administración"
      descripcion="Durante el piloto, las cuentas de administración se crean con un código de acceso entregado por Convive."
      pie={[
        { texto: "¿Ya tienes cuenta?", enlace: "Ingresa aquí", href: "/login" },
        { texto: "¿Eres residente o propietario?", enlace: "Crea tu cuenta de residente", href: "/crear-cuenta/residente" },
      ]}
    >
      <RegistroAdministracionForm accion={crearCuentaAdministracion} codigo={typeof codigo === "string" ? codigo : undefined} />
    </PantallaIngreso>
  );
}
