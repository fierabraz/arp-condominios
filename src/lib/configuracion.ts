// COM-001 · Configurador de comunidades: avance de la configuración y reglas para cambiar de estado.
// Todo es puro (sin base de datos) para poder probarlo; los datos los junta configuracion-servicio.ts.

import { estadoAlicuotas, type EstadoAlicuotas } from "./alicuotas";

export type Estado = "EN_CONFIGURACION" | "HABILITADA_ADMINISTRATIVA" | "HABILITADA_FINANCIERA";
export type Tipo = "EDIFICIO" | "CONDOMINIO_CASAS" | "MIXTO" | "OFICINAS" | "OTRO";
export type Modalidad = "NUEVA" | "EXISTENTE";

export const ESTADOS: Record<Estado, { texto: string; corto: string; descripcion: string }> = {
  EN_CONFIGURACION: {
    texto: "En configuración",
    corto: "En configuración",
    descripcion: "Se están cargando sus datos. Los residentes aún no la ven y no se emiten cobros.",
  },
  HABILITADA_ADMINISTRATIVA: {
    texto: "Habilitada administrativamente",
    corto: "Habilitada (administrativa)",
    descripcion: "Muro, votaciones e invitaciones a residentes disponibles. Todavía no emite cobros ni registra pagos.",
  },
  HABILITADA_FINANCIERA: {
    texto: "Habilitada financieramente",
    corto: "Habilitada",
    descripcion: "Opera completa: emite cobros, registra pagos y lleva fondos y rendiciones.",
  },
};

/** Color de la insignia de cada estado (tonos de Insignia). */
export const TONO_ESTADO = {
  EN_CONFIGURACION: "alerta",
  HABILITADA_ADMINISTRATIVA: "marca",
  HABILITADA_FINANCIERA: "exito",
} as const;

export const ORDEN_ESTADOS: Estado[] = ["EN_CONFIGURACION", "HABILITADA_ADMINISTRATIVA", "HABILITADA_FINANCIERA"];

export const TIPOS: Record<Tipo, string> = {
  EDIFICIO: "Edificio",
  CONDOMINIO_CASAS: "Condominio de casas",
  MIXTO: "Mixto (edificios y casas)",
  OFICINAS: "Oficinas o comercial",
  OTRO: "Otro",
};

export const MODALIDADES: Record<Modalidad, { texto: string; ayuda: string }> = {
  NUEVA: { texto: "Comunidad nueva", ayuda: "Parte de cero en Convive, sin deudas ni saldos anteriores." },
  EXISTENTE: {
    texto: "Comunidad existente",
    ayuda: "Ya funcionaba con otra administración o sistema: tiene deudas, fondos o saldos que traer (migración mixta).",
  },
};

/** Emitir cobros y registrar pagos solo en una comunidad habilitada financieramente. */
export const operaFinanzas = (estado: Estado) => estado === "HABILITADA_FINANCIERA";
/** Invitar residentes y que la vean: desde la habilitación administrativa. */
export const operaAdministracion = (estado: Estado) => estado !== "EN_CONFIGURACION";

export const MENSAJE_SIN_FINANZAS =
  "Esta propiedad aún no está habilitada financieramente. Complétala en Configuración para emitir cobros y registrar pagos.";

/** Lo que el configurador necesita saber de una comunidad. */
export type DatosConfiguracion = {
  estado: Estado;
  nombre: string;
  direccion: string;
  tipo: Tipo | null;
  modalidad: Modalidad | null;
  fechaIncorporacion: Date | null;
  totalUnidades: number | null;
  unidades: number;
  sumaAlicuotas: number;
  unidadesSinPropietario: number;
  /** Avisos de cobro ya emitidos en Convive. */
  cobrosEmitidos: number;
  /** Estructura física registrada (COM-001 · Entrega 2). Es opcional: no todas las propiedades la necesitan. */
  estructura?: { agrupaciones: number; espacios: number; instalaciones: number };
  /** Apertura financiera de una comunidad existente (COM-001 · Entrega 5), si se empezó. */
  apertura?: { estado: "BORRADOR" | "EN_REVISION"; fechaCorte: Date; deudas: number; fondos: number; cuentas: number } | null;
};

export type EstadoPaso = "completo" | "observacion" | "pendiente" | "disponible" | "proximamente";

export type Paso = {
  numero: string;
  titulo: string;
  estado: EstadoPaso;
  detalle: string;
  /** Ruta dentro de la propiedad (se le antepone /condominios/[id]). */
  ruta?: string;
  accion?: string;
  /** Un segundo acceso del mismo paso. */
  otra?: { ruta: string; accion: string };
};

const unidadesTxt = (n: number) => `${n} ${n === 1 ? "unidad" : "unidades"}`;

/** Datos de identificación que faltan (paso 01). */
export function faltanIdentificacion(d: DatosConfiguracion): string[] {
  const faltan: string[] = [];
  if (!d.nombre.trim()) faltan.push("nombre");
  if (!d.direccion.trim()) faltan.push("dirección");
  if (!d.tipo) faltan.push("tipo de comunidad");
  if (!d.modalidad) faltan.push("si es nueva o existente");
  if (!d.fechaIncorporacion) faltan.push("fecha de incorporación");
  return faltan;
}

export function alicuotasDe(d: DatosConfiguracion): EstadoAlicuotas {
  return estadoAlicuotas({ cargadas: d.unidades, suma: d.sumaAlicuotas, total: d.totalUnidades });
}

/** Las 8 etapas del configurador con su avance. Las que aún no se construyen quedan "próximamente". */
export function pasosConfiguracion(d: DatosConfiguracion): Paso[] {
  const faltan = faltanIdentificacion(d);
  const alic = alicuotasDe(d);

  const e = d.estructura;
  const fisica = e && e.agrupaciones + e.espacios + e.instalaciones > 0
    ? ` Estructura física: ${[
        e.agrupaciones && `${e.agrupaciones} ${e.agrupaciones === 1 ? "torre, sector o piso" : "torres, sectores o pisos"}`,
        e.espacios && `${e.espacios} ${e.espacios === 1 ? "estacionamiento o bodega" : "estacionamientos o bodegas"}`,
        e.instalaciones && `${e.instalaciones} ${e.instalaciones === 1 ? "instalación" : "instalaciones"}`,
      ]
        .filter(Boolean)
        .join(", ")}.`
    : "";
  const otra = { ruta: "/estructura", accion: "Estructura física" };
  const base = { numero: "02", titulo: "Estructura y unidades", ruta: "/unidades", otra } as const;
  const estructura: Paso =
    d.unidades === 0
      ? { ...base, estado: "pendiente", detalle: `Aún no hay unidades.${fisica}`, accion: "Agregar unidades" }
      : alic.tipo === "ok"
        ? { ...base, estado: "completo", detalle: alic.texto + fisica, accion: "Ver unidades" }
        : { ...base, estado: "observacion", detalle: alic.texto + fisica, accion: "Seguir con las unidades" };

  const personas: Paso =
    d.unidades === 0
      ? { numero: "03", titulo: "Personas", estado: "pendiente", detalle: "Primero agrega las unidades.", ruta: "/unidades" }
      : d.unidadesSinPropietario === 0
        ? { numero: "03", titulo: "Personas", estado: "completo", detalle: "Todas las unidades tienen propietario.", ruta: "/unidades", accion: "Ver unidades" }
        : {
            numero: "03",
            titulo: "Personas",
            estado: "observacion",
            detalle: `${unidadesTxt(d.unidadesSinPropietario)} sin propietario registrado.`,
            ruta: "/unidades",
            accion: "Completar propietarios",
          };

  const ap = d.apertura;
  const corte = ap ? ap.fechaCorte.toISOString().slice(0, 10).split("-").reverse().join("-") : "";
  const finanzas: Paso =
    d.modalidad === "EXISTENTE"
      ? {
          numero: "04",
          titulo: "Finanzas y apertura",
          estado: !ap ? "pendiente" : ap.estado === "EN_REVISION" ? "completo" : "observacion",
          detalle: !ap
            ? "Registra la fecha de corte y lo que trae del sistema anterior: deudas por unidad, fondos, bancos y cuentas por pagar."
            : `Corte ${corte}: ${ap.deudas} ${ap.deudas === 1 ? "deuda" : "deudas"}, ${ap.fondos} ${ap.fondos === 1 ? "fondo" : "fondos"}, ${ap.cuentas} ${ap.cuentas === 1 ? "cuenta" : "cuentas"}. ${ap.estado === "EN_REVISION" ? "Lista para revisión." : "En borrador."} Aprobarla queda restringido hasta aprobar las reglas.`,
          ruta: "/apertura",
          accion: ap ? "Ver apertura" : "Comenzar apertura",
          otra: { ruta: "/editar", accion: "Reglas de cobro" },
        }
      : {
          numero: "04",
          titulo: "Reglas de cobro",
          estado: "disponible",
          detalle: "Fondo de reserva, interés por mora y día de vencimiento. Tienen valores por defecto; revísalos antes de habilitar.",
          ruta: "/editar",
          accion: "Revisar reglas de cobro",
        };

  return [
    {
      numero: "01",
      titulo: "Identificación",
      estado: faltan.length ? "pendiente" : "completo",
      detalle: faltan.length ? `Falta: ${faltan.join(", ")}.` : "Datos de la comunidad completos.",
      ruta: "/editar",
      accion: faltan.length ? "Completar" : "Editar",
    },
    estructura,
    personas,
    finanzas,
    {
      numero: "05",
      titulo: "Administración y personal",
      estado: "disponible",
      detalle: "Los administradores asignados se manejan en Permisos. Comité y personal llegan en una próxima entrega.",
    },
    { numero: "06", titulo: "Servicios", estado: "proximamente", detalle: "Elegir qué módulos usa la comunidad." },
    { numero: "07", titulo: "Documentos", estado: "proximamente", detalle: "Reglamento, planos, actas y contratos." },
    { numero: "08", titulo: "Validación y activación", estado: d.estado === "HABILITADA_FINANCIERA" ? "completo" : "pendiente", detalle: ESTADOS[d.estado].texto + "." },
  ];
}

/** Porcentaje de avance: pasos completos sobre los pasos que ya se pueden completar (01 a 03). */
export function avanceConfiguracion(d: DatosConfiguracion) {
  const medibles = pasosConfiguracion(d).filter((p) => ["01", "02", "03"].includes(p.numero));
  const completos = medibles.filter((p) => p.estado === "completo").length;
  return { completos, total: medibles.length, porcentaje: Math.round((completos / medibles.length) * 100) };
}

export type Revision = { ok: boolean; bloqueos: string[]; advertencias: string[] };

/** Nivel que exige cada requisito: la habilitación financiera exige también los de la administrativa. */
export type NivelRequisito = "HABILITADA_ADMINISTRATIVA" | "HABILITADA_FINANCIERA";

/**
 * Un requisito del paso 08. `bloqueo` impide habilitar; `advertencia` se puede continuar y queda
 * anotado; `restringido` impide habilitar y no lo puede resolver el usuario: espera una decisión.
 */
export type Requisito = {
  clave: string;
  nivel: NivelRequisito;
  texto: string;
  tipo: "bloqueo" | "advertencia" | "restringido";
  cumple: boolean;
  /** Qué falta, cuando no se cumple. */
  mensaje: string;
  ruta?: string;
};

/** Lo que la revisión de la apertura (revisarApertura) dijo, si ya se calculó. */
export type RevisionApertura = { bloqueos: string[]; advertencias: string[] };

/**
 * Validación del paso 08: todos los requisitos para cada nivel de habilitación, cumplidos o no.
 * revisarCambio usa esta misma lista, así lo que muestra la pantalla y lo que se permite no se separan.
 */
export function requisitosActivacion(d: DatosConfiguracion, revisionApertura?: RevisionApertura): Requisito[] {
  const faltan = faltanIdentificacion(d);
  const alic = alicuotasDe(d);
  const ADM = "HABILITADA_ADMINISTRATIVA" as const;
  const FIN = "HABILITADA_FINANCIERA" as const;
  const r: Requisito[] = [
    {
      clave: "identificacion",
      nivel: ADM,
      texto: "Identificación completa",
      tipo: "bloqueo",
      cumple: faltan.length === 0,
      mensaje: `Completa la identificación: ${faltan.join(", ")}.`,
      ruta: "/editar",
    },
    { clave: "unidades", nivel: ADM, texto: "Al menos una unidad", tipo: "bloqueo", cumple: d.unidades > 0, mensaje: "Agrega al menos una unidad.", ruta: "/unidades" },
    {
      clave: "propietarios",
      nivel: ADM,
      texto: "Todas las unidades con propietario",
      tipo: "advertencia",
      cumple: d.unidades > 0 && d.unidadesSinPropietario === 0,
      mensaje: d.unidades === 0 ? "Todavía no hay unidades." : `${unidadesTxt(d.unidadesSinPropietario)} sin propietario registrado.`,
      ruta: "/unidades",
    },
    {
      clave: "alicuotas",
      nivel: FIN,
      texto: "Unidades y alícuotas completas (100 %)",
      tipo: "bloqueo",
      cumple: d.unidades > 0 && alic.tipo === "ok",
      mensaje: d.unidades === 0 ? "Todavía no hay unidades con alícuota." : alic.texto,
      ruta: "/unidades",
    },
  ];
  if (d.modalidad !== "EXISTENTE") return r;

  const ap = d.apertura;
  r.push(
    {
      clave: "apertura",
      nivel: FIN,
      texto: "Apertura registrada (fecha de corte, deudas, fondos y bancos)",
      tipo: "bloqueo",
      cumple: !!ap,
      mensaje: "Es una comunidad existente: antes de cobrar hay que registrar su apertura (fecha de corte, deudas, fondos y bancos) en el paso 04.",
      ruta: "/apertura",
    },
    {
      clave: "apertura-revision",
      nivel: FIN,
      texto: "Apertura marcada lista para revisión",
      tipo: "bloqueo",
      cumple: ap?.estado === "EN_REVISION",
      mensaje: ap ? "La apertura está en borrador: márcala lista para revisión." : "Primero registra la apertura.",
      ruta: "/apertura",
    },
  );
  if (ap && revisionApertura) {
    r.push(
      {
        clave: "apertura-completa",
        nivel: FIN,
        texto: "Apertura con fondos y cuentas bancarias",
        tipo: "bloqueo",
        cumple: revisionApertura.bloqueos.length === 0,
        mensaje: revisionApertura.bloqueos.join(" "),
        ruta: "/apertura",
      },
      {
        clave: "apertura-observaciones",
        nivel: FIN,
        texto: "Apertura sin observaciones",
        tipo: "advertencia",
        cumple: revisionApertura.advertencias.length === 0,
        mensaje: revisionApertura.advertencias.join(" "),
        ruta: "/apertura",
      },
    );
  }
  r.push({
    clave: "apertura-aprobacion",
    nivel: FIN,
    texto: "Aprobación de la apertura",
    tipo: "restringido",
    cumple: false,
    mensaje:
      "Aprobar la apertura y empezar a cobrar sobre esos saldos queda restringido hasta que se aprueben las reglas de apertura (D-COM-05 a D-COM-08).",
  });
  return r;
}

/** Requisitos que exige pasar a `destino` (los de su nivel y los de los niveles anteriores). */
export const requisitosPara = (rs: Requisito[], destino: Estado) =>
  rs.filter((x) => ORDEN_ESTADOS.indexOf(x.nivel) <= ORDEN_ESTADOS.indexOf(destino));

/**
 * ¿Se puede pasar la comunidad a `destino`? Bajar de estado se permite (no borra nada), salvo
 * dejar de operar finanzas si ya hay cobros emitidos; subir exige los requisitos de cada estado
 * (requisitosActivacion). Lo financiero de una comunidad EXISTENTE queda restringido: su apertura
 * es un borrador que todavía no se puede aprobar.
 */
export function revisarCambio(d: DatosConfiguracion, destino: Estado, revisionApertura?: RevisionApertura): Revision {
  const bloqueos: string[] = [];
  const advertencias: string[] = [];
  if (destino === d.estado) return { ok: false, bloqueos: ["La propiedad ya está en ese estado."], advertencias };
  if (ORDEN_ESTADOS.indexOf(destino) < ORDEN_ESTADOS.indexOf(d.estado)) {
    // Una comunidad que ya cobró no puede dejar de registrar pagos: sus residentes tienen deudas vivas.
    if (d.estado === "HABILITADA_FINANCIERA" && d.cobrosEmitidos > 0) {
      bloqueos.push("Ya emitió cobros en Convive: no puede dejar de estar habilitada financieramente.");
    }
    return { ok: bloqueos.length === 0, bloqueos, advertencias };
  }
  for (const x of requisitosPara(requisitosActivacion(d, revisionApertura), destino)) {
    if (x.cumple) continue;
    // Sin unidades ya hay un bloqueo: no se repite como advertencia.
    if (x.clave === "propietarios" && d.unidades === 0) continue;
    if (x.clave === "alicuotas" && d.unidades === 0) continue;
    (x.tipo === "advertencia" ? advertencias : bloqueos).push(x.mensaje);
  }
  return { ok: bloqueos.length === 0, bloqueos, advertencias };
}
