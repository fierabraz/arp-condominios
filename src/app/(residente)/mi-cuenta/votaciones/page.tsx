import { requireUsuario } from "@/lib/auth";
import { PageHeader, Vacio } from "@/components/ui";
import { unidadesVisibles } from "../../datos-residente";
import { VotacionesResidente } from "./votaciones-residente";

export default async function VotacionesPage({ searchParams }: PageProps<"/mi-cuenta/votaciones">) {
  const usuario = await requireUsuario(["RESIDENTE"]);
  const { condominioIds } = await unidadesVisibles(usuario, (await searchParams).unidad);
  const contenido = usuario.personaId ? await VotacionesResidente({ personaId: usuario.personaId, condominioIds }) : null;
  return (
    <>
      <PageHeader titulo="Votaciones" descripcion="Vota en las decisiones de tu comunidad y revisa los resultados. Votan los propietarios." />
      {contenido ?? <Vacio>No hay votaciones abiertas ni resultados recientes en tu comunidad.</Vacio>}
    </>
  );
}
