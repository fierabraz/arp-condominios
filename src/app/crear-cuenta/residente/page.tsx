import { PantallaIngreso } from "@/app/login/pantalla-ingreso";
import { comunidadPorCodigo } from "@/lib/cuentas";
import { consultarComunidad, crearCuentaResidente } from "../actions";
import { RegistroResidenteForm } from "../formularios";

export default async function CrearCuentaResidentePage({ searchParams }: PageProps<"/crear-cuenta/residente">) {
  const { comunidad } = await searchParams;
  const codigo = typeof comunidad === "string" ? comunidad : undefined;
  // Con el enlace que comparte la administración, la comunidad aparece ya escrita.
  const nombre = codigo ? ((await comunidadPorCodigo(codigo))?.nombre ?? null) : null;
  return (
    <PantallaIngreso
      publico="residentes"
      titulo="Crear cuenta de residente o propietario"
      descripcion="Crea tu cuenta con tu correo. La administración de tu comunidad confirmará tu unidad antes de mostrarte su información. Si te llegó una invitación por correo, usa ese enlace en vez de este formulario."
      pie={[
        { texto: "¿Ya tienes cuenta?", enlace: "Ingresa aquí", href: "/login/residentes" },
      ]}
    >
      <RegistroResidenteForm
        accion={crearCuentaResidente}
        consultar={consultarComunidad}
        comunidad={codigo}
        nombreComunidad={nombre}
      />
    </PantallaIngreso>
  );
}
