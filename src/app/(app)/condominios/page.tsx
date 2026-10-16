import { requireAdministradora } from "@/lib/auth";
import { BotonLink, PageHeader, Vacio } from "@/components/ui";
import { TarjetaPropiedad } from "@/components/tarjeta-propiedad";
import { resumenPropiedades } from "@/lib/resumen-propiedades";

export default async function CondominiosPage() {
  const { administradoraId } = await requireAdministradora();
  const propiedades = await resumenPropiedades(administradoraId);

  return (
    <>
      <PageHeader
        titulo="Mis propiedades"
        descripcion="Edificios y condominios que administras"
        acciones={<BotonLink href="/condominios/nuevo">Crear propiedad</BotonLink>}
      />
      {propiedades.length === 0 ? (
        <Vacio>Aún no tienes propiedades. Crea la primera para empezar.</Vacio>
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
