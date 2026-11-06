import { BotonLink } from "@/components/ui";
import { textoCupo, type Cupo } from "@/lib/planes";

/**
 * PLA-002: botón "Nueva comunidad" según el cupo del plan. Si ya no queda cupo, en vez del botón
 * se ve el motivo; si queda, una línea con lo usado ("2 de 3 comunidades del plan Esencial Pro").
 */
export function BotonNuevaComunidad({ cupo }: { cupo: Cupo }) {
  if (!cupo.puede) {
    return (
      <p role="status" className="max-w-md rounded-xl bg-alerta-suave px-3 py-2 text-sm text-alerta">
        {cupo.motivo}
      </p>
    );
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <BotonLink href="/condominios/nuevo">Nueva comunidad</BotonLink>
      {cupo.plan && <LineaCupo cupo={cupo} />}
    </div>
  );
}

export function LineaCupo({ cupo }: { cupo: Cupo }) {
  return (
    <p className="text-xs text-texto-suave">
      {textoCupo(cupo)} comunidades{cupo.plan ? ` · plan ${cupo.plan}` : ""}
      {cupo.restantes !== null && cupo.restantes > 0 ? ` · te ${cupo.restantes === 1 ? "queda 1" : `quedan ${cupo.restantes}`}` : ""}
    </p>
  );
}
