// SEG-20: cuándo una persona no se puede eliminar y qué hay que hacer antes. Función pura para probarla.

export type UsoPersona = { unidades: number; vinculos: number; tieneCuenta: boolean };

/** Lo que impide eliminar a la persona, en palabras para el administrador. Vacío: se puede eliminar. */
export function motivosParaNoEliminar(u: UsoPersona): string[] {
  const motivos: string[] = [];
  if (u.vinculos > 0) {
    motivos.push(
      `Tiene ${u.vinculos === 1 ? "un vínculo" : `${u.vinculos} vínculos`} con unidades (vigentes o terminados). Esos vínculos son historial y no se borran: si ya no vive o no es dueña, termina el vínculo en la unidad.`,
    );
  } else if (u.unidades > 0) {
    motivos.push(`Está asociada a ${u.unidades === 1 ? "una unidad" : `${u.unidades} unidades`}. Quítala primero de la unidad.`);
  }
  if (u.tieneCuenta) motivos.push("Tiene una cuenta para entrar a Convive. Primero quita la cuenta en Permisos (lo hace el administrador principal).");
  return motivos;
}

/** Condición para borrar en la misma consulta: si algo cambió entre medio, no se borra. */
export const sinUso = { unidades: { none: {} }, vinculos: { none: {} }, usuario: { is: null } } as const;
