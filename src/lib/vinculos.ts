// COM-001 · Entrega 3: vínculos de las personas con las unidades. Funciones puras para probarlas.

export type TipoVinculo = "PROPIETARIO" | "COPROPIETARIO" | "ARRENDATARIO" | "RESIDENTE" | "OCUPANTE";
export type Relacion = "PROPIETARIO" | "RESIDENTE";

export const TIPOS_VINCULO: Record<TipoVinculo, { texto: string; ayuda: string }> = {
  PROPIETARIO: { texto: "Propietario", ayuda: "Dueño de la unidad según la escritura. Vota y recibe los cobros." },
  COPROPIETARIO: { texto: "Copropietario", ayuda: "Comparte la propiedad con el propietario. Vota y recibe los cobros como él." },
  ARRENDATARIO: { texto: "Arrendatario", ayuda: "Arrienda la unidad. Tiene acceso a la app como residente." },
  RESIDENTE: { texto: "Residente", ayuda: "Vive en la unidad (familiar del propietario, por ejemplo). Tiene acceso a la app." },
  OCUPANTE: { texto: "Ocupante", ayuda: "Usa la unidad sin vivir en ella o por un tiempo. Queda registrado, sin acceso a la app." },
};

export const ORDEN_TIPOS: TipoVinculo[] = ["PROPIETARIO", "COPROPIETARIO", "ARRENDATARIO", "RESIDENTE", "OCUPANTE"];

/**
 * Qué relación da cada vínculo en el resto de Convive (cobros, votaciones y app de residentes).
 * El ocupante no da ninguna: no recibe acceso hasta que se decida otra cosa.
 */
export function relacionDe(tipo: TipoVinculo): Relacion | null {
  if (tipo === "PROPIETARIO" || tipo === "COPROPIETARIO") return "PROPIETARIO";
  if (tipo === "ARRENDATARIO" || tipo === "RESIDENTE") return "RESIDENTE";
  return null;
}

/** Relaciones que deben existir hoy para una persona en una unidad, según sus vínculos vigentes. */
export function relacionesVigentes(vinculos: { tipo: TipoVinculo; hasta: Date | null }[]): Relacion[] {
  const r = new Set<Relacion>();
  for (const v of vinculos) {
    if (v.hasta) continue;
    const rel = relacionDe(v.tipo);
    if (rel) r.add(rel);
  }
  return [...r].sort();
}

export type VinculoExistente = { personaId: string; nombre: string; tipo: TipoVinculo; hasta: Date | null };
export type NuevoVinculo = { personaId: string; tipo: TipoVinculo; desde: Date; terminoPrevisto: Date | null };

const DUENOS: TipoVinculo[] = ["PROPIETARIO", "COPROPIETARIO"];

/** Error si el nuevo vínculo repite o contradice uno vigente de la misma unidad. Solo coherencia de datos. */
export function revisarVinculo(nuevo: NuevoVinculo, existentes: VinculoExistente[], hoy: Date): string | null {
  if (nuevo.desde > hoy) return "La fecha de inicio no puede ser futura. Regístralo cuando empiece.";
  if (nuevo.terminoPrevisto && nuevo.terminoPrevisto < nuevo.desde) return "El término previsto es anterior al inicio.";
  const vigentes = existentes.filter((e) => !e.hasta);
  const propios = vigentes.filter((e) => e.personaId === nuevo.personaId);
  if (propios.some((e) => e.tipo === nuevo.tipo)) return `Ya está registrado como ${TIPOS_VINCULO[nuevo.tipo].texto.toLowerCase()} de esta unidad.`;
  if (DUENOS.includes(nuevo.tipo) && propios.some((e) => DUENOS.includes(e.tipo))) {
    return "Ya es dueño de esta unidad. Para cambiar entre propietario y copropietario, termina el vínculo actual primero.";
  }
  if (nuevo.tipo === "ARRENDATARIO" && propios.some((e) => DUENOS.includes(e.tipo))) {
    return "Es dueño de esta unidad: no puede ser también su arrendatario.";
  }
  if (DUENOS.includes(nuevo.tipo) && propios.some((e) => e.tipo === "ARRENDATARIO")) {
    return "Es arrendatario de esta unidad. Si la compró, termina el arriendo primero.";
  }
  if (nuevo.tipo === "PROPIETARIO") {
    const otro = vigentes.find((e) => e.tipo === "PROPIETARIO" && e.personaId !== nuevo.personaId);
    if (otro) return `${otro.nombre} ya figura como propietario. Registra a esta persona como copropietario o termina el vínculo anterior.`;
  }
  return null;
}

/** RUT o documento sin puntos, espacios ni guion, en mayúsculas: "12.345.678-k" → "12345678K". */
export const normalizarRut = (s: string) => s.replace(/[.\s-]/g, "").toUpperCase();

/** Nombre sin tildes, mayúsculas ni espacios de más, para comparar. */
export const normalizarNombre = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export type PersonaComparable = { id: string; nombre: string; documento: string | null; correo: string | null };

/**
 * Busca si la persona ya existe en la administradora. Mismo RUT o mismo correo: es la misma
 * (no se crea otra). Mismo nombre sin RUT que lo distinga: posible duplicado, hay que confirmar.
 */
export function buscarDuplicado(
  p: { nombre: string; documento?: string | null; correo?: string | null },
  personas: PersonaComparable[],
  excluirId?: string,
): { tipo: "documento" | "correo" | "nombre"; persona: PersonaComparable } | null {
  const otras = personas.filter((x) => x.id !== excluirId);
  if (p.documento) {
    const rut = normalizarRut(p.documento);
    const m = otras.find((x) => x.documento && normalizarRut(x.documento) === rut);
    if (m) return { tipo: "documento", persona: m };
  }
  if (p.correo) {
    const correo = p.correo.toLowerCase();
    const m = otras.find((x) => x.correo?.toLowerCase() === correo);
    if (m) return { tipo: "correo", persona: m };
  }
  const nombre = normalizarNombre(p.nombre);
  const m = otras.find(
    (x) => normalizarNombre(x.nombre) === nombre && !(p.documento && x.documento && normalizarRut(p.documento) !== normalizarRut(x.documento)),
  );
  return m ? { tipo: "nombre", persona: m } : null;
}
