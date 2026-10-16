// Módulos de una propiedad, tal como aparecen en su menú lateral.
// `ruta` es relativa a /condominios/[id]; los módulos sin ruta todavía no existen
// y muestran una página de "próximamente" con su descripción.

export type Modulo = {
  clave: string;
  texto: string;
  ruta?: string;
  soloAdmin?: boolean;
  descripcion: string;
};

export type GrupoModulos = { clave: string; texto: string; icono: string; modulos: Modulo[] };

export const GRUPOS_MODULOS: GrupoModulos[] = [
  {
    clave: "cobranza",
    texto: "Cobranza y recaudación",
    icono: "cobranza",
    modulos: [
      { clave: "gasto-comun", texto: "Gasto común", ruta: "/periodos", descripcion: "Períodos mensuales, gastos y emisión de avisos de cobro." },
      { clave: "recaudacion", texto: "Recaudación", ruta: "/pagos", descripcion: "Registro de pagos de cada unidad." },
      { clave: "morosidad", texto: "Morosidad", ruta: "/morosidad", descripcion: "Unidades con cobros vencidos sin pagar." },
      { clave: "registro-correos", texto: "Registro de correos", ruta: "/correos", descripcion: "Avisos de cobro enviados por correo y su estado." },
      { clave: "pago-en-linea", texto: "Pago en línea", descripcion: "Los residentes pagan su gasto común con tarjeta o transferencia desde su cuenta, y el pago se registra solo." },
    ],
  },
  {
    clave: "conserjeria",
    texto: "Conserjería",
    icono: "conserjeria",
    modulos: [
      { clave: "bitacora", texto: "Bitácora", descripcion: "Registro de turnos y novedades del conserje." },
      { clave: "visitas", texto: "Visitas", descripcion: "Ingreso y salida de visitas por unidad." },
      { clave: "encomiendas", texto: "Encomiendas", descripcion: "Paquetes recibidos en conserjería y aviso al residente." },
      { clave: "reservas", texto: "Reservas de espacios comunes", descripcion: "Quincho, salón de eventos y otros espacios, con calendario y cobro." },
    ],
  },
  {
    clave: "finanzas",
    texto: "Contabilidad y finanzas",
    icono: "finanzas",
    modulos: [
      { clave: "egresos", texto: "Egresos", ruta: "/egresos", descripcion: "Todos los gastos registrados en la propiedad." },
      { clave: "fondos", texto: "Fondos", ruta: "/fondos", descripcion: "Fondo de reserva acumulado mes a mes." },
      { clave: "rendiciones", texto: "Rendiciones", ruta: "/rendiciones", descripcion: "Rendición mensual en PDF de cada mes cerrado." },
      { clave: "conciliacion", texto: "Conciliación bancaria", descripcion: "Cruza la cartola del banco con los pagos y gastos registrados para cuadrar la cuenta." },
    ],
  },
  {
    clave: "comunidad",
    texto: "Comunidad conectada",
    icono: "comunidad",
    modulos: [
      { clave: "muro", texto: "Muro de la comunidad", ruta: "/muro", descripcion: "Publicaciones y avisos para los residentes." },
      { clave: "residentes", texto: "Residentes", ruta: "/unidades", descripcion: "Unidades, alícuotas, propietarios y residentes." },
      { clave: "votaciones", texto: "Votaciones", descripcion: "Consultas y votaciones en línea para asambleas, ponderadas por alícuota." },
    ],
  },
  {
    clave: "remuneraciones",
    texto: "Remuneraciones",
    icono: "remuneraciones",
    modulos: [
      { clave: "remuneraciones", texto: "Remuneraciones", descripcion: "Liquidaciones de sueldo del personal (conserjes, aseo, mantención), con imposiciones." },
    ],
  },
];

export const FAVORITOS_INICIALES = ["egresos", "gasto-comun", "conciliacion", "residentes", "recaudacion", "votaciones"];

export const TODOS_LOS_MODULOS = GRUPOS_MODULOS.flatMap((g) => g.modulos);

// Módulos que se abren desde los accesos del panel pero no van en el menú.
const MODULOS_PANEL: Modulo[] = [
  {
    clave: "asistente",
    texto: "Asistente administrativo",
    descripcion: "Un asistente que responde preguntas sobre la propiedad (deudas, gastos, reglamento) y redacta comunicados.",
  },
];

export function moduloPorClave(clave: string) {
  return [...TODOS_LOS_MODULOS, ...MODULOS_PANEL].find((m) => m.clave === clave);
}

/** Dirección del módulo dentro de la propiedad: su página, o la de "próximamente". */
export function rutaModulo(condominioId: string, m: Modulo) {
  return `/condominios/${condominioId}${m.ruta ?? `/modulo/${m.clave}`}`;
}
