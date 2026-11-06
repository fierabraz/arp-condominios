import { requireAdministradora } from "@/lib/auth";
import { condominiosPermitidos, esPrincipal } from "@/lib/permisos";
import { PageHeader, Vacio } from "@/components/ui";
import { TarjetaPropiedad } from "@/components/tarjeta-propiedad";
import { BotonNuevaComunidad } from "@/components/cupo-comunidades";
import { cupoDe } from "@/lib/planes-servicio";
import { resumenPropiedades } from "@/lib/resumen-propiedades";

export default async function CondominiosPage() {
  const { usuario, administradoraId } = await requireAdministradora();
  const propiedades = await resumenPropiedades(administradoraId, condominiosPermitidos(usuario) ?? undefined);
  const principal = esPrincipal(usuario);
  // PLA-002: cupo de comunidades del plan (solo lo necesita quien puede crear).
  const cupo = principal ? await cupoDe(administradoraId) : null;

  return (
    <>
      <PageHeader
        titulo="Mis propiedades"
        descripcion={principal ? "Edificios y condominios que administras" : "Edificios y condominios que tienes asignados"}
        acciones={principal ? <BotonNuevaComunidad cupo={cupo!} /> : undefined}
      />
      {propiedades.length === 0 ? (
        <Vacio>
          {principal
            ? "Aún no tienes propiedades. Crea la primera para empezar."
            : "Aún no tienes propiedades asignadas. Pide al administrador principal que te asigne en Permisos."}
        </Vacio>
      ) : (
        <div className="overflow-hidden rounded-xl border border-borde shadow-sm">
          {propiedades.map((p) => (
            <TarjetaPropiedad key={p.id} p={p} />
          ))}
        </div>
      )}
    </>
  );
}
