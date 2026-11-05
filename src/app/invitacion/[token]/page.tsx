import { PantallaIngreso } from "@/app/login/pantalla-ingreso";
import { ClaveNuevaForm } from "@/app/recuperar/formularios";
import { BotonLink } from "@/components/ui";
import { db } from "@/lib/db";
import { MARCA } from "@/lib/marca";
import { tokenVigente } from "@/lib/recuperacion";
import { LOGIN } from "@/lib/session";
import { aceptarInvitacion } from "../actions";

export default async function InvitacionPage({ params }: PageProps<"/invitacion/[token]">) {
  const { token } = await params;
  const t = await tokenVigente(token, "INVITACION");
  if (!t) {
    return (
      <PantallaIngreso
        publico="residentes"
        titulo="Esta invitación ya no sirve"
        descripcion="Las invitaciones sirven una sola vez y vencen a los 7 días. Si ya creaste tu contraseña, ingresa con tu correo. Si no, pide una invitación nueva a la administración."
      >
        <BotonLink href={LOGIN.RESIDENTE} className="w-full">
          Ir al ingreso de residentes
        </BotonLink>
      </PantallaIngreso>
    );
  }
  const propiedades = await db.condominio.findMany({
    where: { unidades: { some: { personas: { some: { persona: { usuario: { id: t.usuarioId } } } } } } },
    select: { nombre: true },
    orderBy: { nombre: "asc" },
  });
  const nombre = t.usuario.nombre.split(" ")[0];
  const donde = propiedades.map((p) => p.nombre).join(", ") || MARCA.nombre;
  return (
    <PantallaIngreso
      publico="residentes"
      titulo={`¡Hola, ${nombre}! Crea tu contraseña`}
      descripcion={`Te invitaron a la app de ${donde}. Tu usuario es ${t.usuario.correo}.`}
    >
      <ClaveNuevaForm accion={aceptarInvitacion.bind(null, token)} textoBoton="Crear contraseña y entrar" />
    </PantallaIngreso>
  );
}
