// COM-001 · Entrega 2: estructura física de la comunidad (agrupaciones, estacionamientos y
// bodegas, asignaciones de uso e instalaciones). Funciones puras para poder probarlas.

export type TipoAgrupacion = "SECTOR" | "TORRE" | "EDIFICIO" | "PISO" | "NIVEL" | "OTRO";
export type Clase = "ESTACIONAMIENTO" | "BODEGA";
export type Regimen = "UNIDAD_PRIVADA" | "ACCESORIO" | "BIEN_COMUN" | "POR_DEFINIR";
export type Destino = "PRIVADO" | "VISITAS" | "USO_COMUN" | "SERVICIO";
export type EstadoEspacio = "DISPONIBLE" | "ASIGNADO" | "FUERA_DE_USO";
export type TipoAsignacion = "PERMANENTE" | "TEMPORAL";
export type TipoInstalacion =
  | "ASCENSOR"
  | "BOMBA"
  | "PORTON"
  | "CAMARA"
  | "ELECTRICO"
  | "SANITARIO"
  | "CONTRA_INCENDIOS"
  | "ESPACIO_COMUN"
  | "EQUIPAMIENTO"
  | "OTRO";
export type EstadoInstalacion = "OPERATIVA" | "CON_OBSERVACIONES" | "FUERA_DE_SERVICIO" | "SIN_INFORMACION";

export const TIPOS_AGRUPACION: Record<TipoAgrupacion, string> = {
  SECTOR: "Sector",
  TORRE: "Torre",
  EDIFICIO: "Edificio",
  PISO: "Piso",
  NIVEL: "Nivel o subterráneo",
  OTRO: "Otro",
};

export const CLASES: Record<Clase, { singular: string; plural: string }> = {
  ESTACIONAMIENTO: { singular: "Estacionamiento", plural: "Estacionamientos" },
  BODEGA: { singular: "Bodega", plural: "Bodegas" },
};

export const REGIMENES: Record<Regimen, { texto: string; ayuda: string }> = {
  UNIDAD_PRIVADA: { texto: "Unidad privada", ayuda: "Tiene rol y alícuota propios: se cobra como una unidad más." },
  ACCESORIO: { texto: "Accesorio de una unidad", ayuda: "Pertenece a un departamento, casa o local." },
  BIEN_COMUN: { texto: "Bien común", ayuda: "Es de la comunidad. No tiene alícuota ni se cobra." },
  POR_DEFINIR: { texto: "Por definir", ayuda: "Aún no se sabe. No se supone ninguna condición." },
};

export const DESTINOS: Record<Destino, string> = {
  PRIVADO: "Privado",
  VISITAS: "Visitas",
  USO_COMUN: "Uso común",
  SERVICIO: "Servicio (carga, proveedores, administración)",
};

export const ESTADOS_ESPACIO: Record<EstadoEspacio, string> = {
  DISPONIBLE: "Disponible",
  ASIGNADO: "Con uso asignado",
  FUERA_DE_USO: "Fuera de uso",
};

export const TIPOS_ASIGNACION: Record<TipoAsignacion, string> = {
  PERMANENTE: "Uso exclusivo",
  TEMPORAL: "Asignación temporal",
};

export const TIPOS_INSTALACION: Record<TipoInstalacion, string> = {
  ASCENSOR: "Ascensor",
  BOMBA: "Bomba o sala de bombas",
  PORTON: "Portón o acceso",
  CAMARA: "Cámaras",
  ELECTRICO: "Sistema eléctrico o generador",
  SANITARIO: "Sistema sanitario",
  CONTRA_INCENDIOS: "Sistema contra incendios",
  ESPACIO_COMUN: "Espacio común (quincho, sala, piscina…)",
  EQUIPAMIENTO: "Equipamiento comunitario",
  OTRO: "Otro",
};

export const ESTADOS_INSTALACION: Record<EstadoInstalacion, string> = {
  OPERATIVA: "Operativa",
  CON_OBSERVACIONES: "Con observaciones",
  FUERA_DE_SERVICIO: "Fuera de servicio",
  SIN_INFORMACION: "Sin información",
};

// ── Agrupaciones ───────────────────────────────────────────────────────────

export type AgrupacionPlana = { id: string; tipo: TipoAgrupacion; nombre: string; padreId: string | null; orden: number };

/** "Torre A" (o el nombre tal cual si ya dice el tipo, como "Torre Norte", "Subterráneo -1" u "Otro"). */
export function nombreAgrupacion(a: Pick<AgrupacionPlana, "tipo" | "nombre">) {
  const palabras = TIPOS_AGRUPACION[a.tipo].split(" ").filter((w) => w.length > 2);
  const yaLoDice = palabras.some((w) => a.nombre.toLowerCase().startsWith(w.toLowerCase()));
  return a.tipo === "OTRO" || yaLoDice ? a.nombre : `${palabras[0]} ${a.nombre}`;
}

/** "Torre A › Piso 3": el nombre completo, de la raíz a la agrupación. */
export function rutaAgrupacion(id: string | null | undefined, todas: AgrupacionPlana[]): string {
  if (!id) return "";
  const porId = new Map(todas.map((a) => [a.id, a]));
  const partes: string[] = [];
  const vistos = new Set<string>();
  let actual = porId.get(id);
  while (actual && !vistos.has(actual.id)) {
    vistos.add(actual.id);
    partes.unshift(nombreAgrupacion(actual));
    actual = actual.padreId ? porId.get(actual.padreId) : undefined;
  }
  return partes.join(" › ");
}

/** Agrupaciones en orden de árbol (cada una seguida de sus hijas), con su profundidad. */
export function arbolAgrupaciones(todas: AgrupacionPlana[]): (AgrupacionPlana & { nivel: number; ruta: string })[] {
  const hijas = new Map<string | null, AgrupacionPlana[]>();
  for (const a of todas) {
    const k = a.padreId && todas.some((x) => x.id === a.padreId) ? a.padreId : null;
    hijas.set(k, [...(hijas.get(k) ?? []), a]);
  }
  const orden = (xs: AgrupacionPlana[]) =>
    [...xs].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es", { numeric: true }));
  const salida: (AgrupacionPlana & { nivel: number; ruta: string })[] = [];
  const vistos = new Set<string>();
  const recorrer = (padre: string | null, nivel: number) => {
    for (const a of orden(hijas.get(padre) ?? [])) {
      if (vistos.has(a.id)) continue;
      vistos.add(a.id);
      salida.push({ ...a, nivel, ruta: rutaAgrupacion(a.id, todas) });
      recorrer(a.id, nivel + 1);
    }
  };
  recorrer(null, 0);
  return salida;
}

// ── Estacionamientos y bodegas ─────────────────────────────────────────────

export type DatosEspacio = {
  regimen: Regimen;
  destino: Destino | null;
  unidadPropiaId: string | null;
  unidadPrincipalId: string | null;
};

/**
 * Revisa que la condición jurídica y los vínculos no se contradigan. Los errores impiden guardar;
 * las advertencias se muestran. No se valida contra la ley: solo coherencia de los datos.
 */
export function revisarEspacio(d: DatosEspacio): { errores: Record<string, string>; advertencias: string[] } {
  const errores: Record<string, string> = {};
  const advertencias: string[] = [];
  if (d.regimen === "BIEN_COMUN") {
    if (d.unidadPropiaId) errores.unidadPropiaId = "Un bien común no es una unidad que se cobra: deja este campo vacío.";
    if (d.unidadPrincipalId)
      errores.unidadPrincipalId = "Un bien común no pertenece a una unidad. Si una unidad lo usa, regístralo como asignación de uso.";
  }
  if (d.regimen === "ACCESORIO") {
    if (!d.unidadPrincipalId) errores.unidadPrincipalId = "Indica la unidad a la que pertenece.";
    if (d.unidadPropiaId) errores.unidadPropiaId = "Un accesorio no tiene alícuota propia: deja este campo vacío.";
  }
  if (d.regimen === "UNIDAD_PRIVADA") {
    if (d.unidadPrincipalId) errores.unidadPrincipalId = "Una unidad privada no pertenece a otra unidad.";
    if (!d.unidadPropiaId) advertencias.push("Falta indicar la unidad con alícuota que lo representa (en Unidades).");
  }
  if (d.regimen === "POR_DEFINIR") advertencias.push("Su condición jurídica está por definir.");
  if (!d.destino) advertencias.push("Falta indicar su destino.");
  if (d.regimen === "BIEN_COMUN" && d.destino === "PRIVADO") {
    advertencias.push("Es bien común con destino privado: normalmente eso requiere una asignación de uso respaldada.");
  }
  return { errores, advertencias };
}

/** Quién es el propietario, según su condición. Nunca se presume. */
export function propiedadDe(e: {
  regimen: Regimen;
  unidadPropia?: { numero: string } | null;
  unidadPrincipal?: { numero: string } | null;
}): string {
  switch (e.regimen) {
    case "BIEN_COMUN":
      return "La comunidad (bien común)";
    case "ACCESORIO":
      return e.unidadPrincipal ? `Propietarios de la unidad ${e.unidadPrincipal.numero}` : "Accesorio sin unidad indicada";
    case "UNIDAD_PRIVADA":
      return e.unidadPropia ? `Propietarios de la unidad ${e.unidadPropia.numero}` : "Unidad privada (falta vincular la unidad)";
    default:
      return "Por definir";
  }
}

// ── Asignaciones de uso ────────────────────────────────────────────────────

export type Periodo = { desde: Date; hasta: Date | null };

/** Vigente en esa fecha (las fechas son días: "hasta" incluye ese día). */
export const vigente = (a: Periodo, fecha: Date) => a.desde <= fecha && (!a.hasta || a.hasta >= fecha);

/** Dos períodos que comparten al menos un día. */
export function seSolapan(a: Periodo, b: Periodo) {
  const finA = a.hasta?.getTime() ?? Infinity;
  const finB = b.hasta?.getTime() ?? Infinity;
  return a.desde.getTime() <= finB && b.desde.getTime() <= finA;
}

/** Error si la nueva asignación se cruza con otra del mismo espacio, o si sus fechas no tienen sentido. */
export function revisarAsignacion(nueva: Periodo, existentes: (Periodo & { beneficiario: string })[]): string | null {
  if (nueva.hasta && nueva.hasta < nueva.desde) return "La fecha de término es anterior a la de inicio.";
  const cruce = existentes.find((e) => seSolapan(nueva, e));
  if (cruce) {
    return `Se cruza con la asignación a ${cruce.beneficiario}${cruce.hasta ? "" : " (sigue vigente)"}. Termínala primero o elige otras fechas.`;
  }
  return null;
}

/** Hoy (en Chile) como día a medianoche UTC, para compararlo con fechas guardadas como día. */
export function hoyDia(ahora = new Date()) {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(ahora);
  return new Date(`${s}T00:00:00Z`);
}

/** Asignación vigente hoy (o la que corresponda a la fecha) de una lista. */
export const asignacionVigente = <T extends Periodo>(asignaciones: T[], fecha = hoyDia()) =>
  asignaciones.find((a) => vigente(a, fecha)) ?? null;

/** Opciones para un selector: en orden de árbol, las raíces con su nombre y las hijas con sangría. */
export const opcionesAgrupaciones = (todas: AgrupacionPlana[]) =>
  arbolAgrupaciones(todas).map((a) => ({ id: a.id, texto: `${"· ".repeat(a.nivel)}${nombreAgrupacion(a)}` }));

/**
 * Situación de hoy de un estacionamiento o bodega, para mostrarla: quién lo usa y con qué estado.
 * Uno privado sin asignación lo usa su dueño; uno común o de visitas sin asignación está disponible.
 */
export function situacionEspacio(
  e: { estado: EstadoEspacio; regimen: Regimen; unidadPropia?: { numero: string } | null; unidadPrincipal?: { numero: string } | null },
  actual: { beneficiario: string } | null,
): { texto: string; tono: "neutro" | "marca" | "alerta"; quien: string | null } {
  if (e.estado === "FUERA_DE_USO") return { texto: ESTADOS_ESPACIO.FUERA_DE_USO, tono: "alerta", quien: actual?.beneficiario ?? null };
  if (actual) return { texto: ESTADOS_ESPACIO.ASIGNADO, tono: "marca", quien: actual.beneficiario };
  const duena = e.regimen === "ACCESORIO" ? e.unidadPrincipal : e.regimen === "UNIDAD_PRIVADA" ? e.unidadPropia : null;
  if (duena) return { texto: "Uso del propietario", tono: "marca", quien: `Unidad ${duena.numero} (propietaria)` };
  return { texto: ESTADOS_ESPACIO.DISPONIBLE, tono: "neutro", quien: null };
}
