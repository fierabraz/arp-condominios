/**
 * SUS-001: cupo de comunidades según el plan que la plataforma asigna a cada administradora.
 * Lógica pura (sin base de datos) para poder probarla. Los planes no guardan precios:
 * se asignan a mano desde /plataforma.
 */

export type PlanCupo = { nombre: string; maxComunidades: number | null } | null;

export type Cupo = {
  /** ¿Puede crear una comunidad más ahora? */
  puede: boolean;
  /** Comunidades que ya tiene (cualquier estado, también "En configuración"). */
  usadas: number;
  /** Máximo del plan; null = sin límite. */
  limite: number | null;
  /** Cuántas puede crear todavía; null = sin límite. */
  restantes: number | null;
  /** Nombre del plan, o null si no tiene plan asignado. */
  plan: string | null;
  /** Por qué no puede (o null si puede). Texto para mostrar al administrador. */
  motivo: string | null;
};

export const MENSAJE_AMPLIAR = "Para crear más, pide al equipo de Convive que amplíe tu plan.";

export function calcularCupo(a: { creaComunidades: boolean; plan: PlanCupo }, usadas: number): Cupo {
  const limite = a.plan?.maxComunidades ?? null;
  const restantes = limite === null ? null : Math.max(0, limite - usadas);
  const base = { usadas, limite, restantes, plan: a.plan?.nombre ?? null };
  if (!a.creaComunidades) {
    return {
      ...base,
      puede: false,
      motivo: "Tu administradora no tiene habilitada la creación de comunidades. Pide al equipo de Convive que la habilite.",
    };
  }
  if (limite !== null && usadas >= limite) {
    return {
      ...base,
      puede: false,
      motivo: `Tu plan ${a.plan!.nombre} permite ${limite} ${limite === 1 ? "comunidad" : "comunidades"} y ya tienes ${usadas}. ${MENSAJE_AMPLIAR}`,
    };
  }
  return { ...base, puede: true, motivo: null };
}

/** "2 de 3", "2 (sin límite)". */
export function textoCupo(c: Pick<Cupo, "usadas" | "limite">) {
  return c.limite === null ? `${c.usadas} (sin límite)` : `${c.usadas} de ${c.limite}`;
}
