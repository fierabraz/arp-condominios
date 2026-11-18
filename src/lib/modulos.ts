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
      { clave: "transferencias", texto: "Transferencias informadas", ruta: "/transferencias", soloAdmin: true, descripcion: "Transferencias que informan los residentes: verificarlas con la cartola y registrarlas como pago." },
      { clave: "datos-pago", texto: "Datos para transferir", ruta: "/datos-pago", soloAdmin: true, descripcion: "Cuenta bancaria de la comunidad que ven los residentes al pulsar «Pagar»." },
      { clave: "morosidad", texto: "Morosidad", ruta: "/morosidad", descripcion: "Unidades con cobros vencidos sin pagar." },
      { clave: "registro-correos", texto: "Registro de correos", ruta: "/correos", descripcion: "Avisos de cobro enviados por correo y su estado." },
      { clave: "pago-en-linea", texto: "Pago en línea", descripcion: "Pasarela de pago con tarjeta o transferencia automática. Por ahora los residentes transfieren desde su banco e informan el pago (Transferencias informadas)." },
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
      { clave: "reservas", texto: "Reservas de espacios comunes", ruta: "/reservas", descripcion: "Quincho, salón de eventos y otros espacios, con calendario y cobro." },
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
      { clave: "conciliacion", texto: "Conciliación bancaria", ruta: "/conciliacion", descripcion: "Cuentas bancarias, carga de cartolas (Excel o CSV) y consulta de movimientos para cuadrar la cuenta." },
    ],
  },
  {
    clave: "comunidad",
    texto: "Comunidad conectada",
    icono: "comunidad",
    modulos: [
      { clave: "muro", texto: "Muro de la comunidad", ruta: "/muro", descripcion: "Publicaciones y avisos para los residentes." },
      { clave: "residentes", texto: "Residentes", ruta: "/unidades", descripcion: "Unidades, porcentajes de prorrateo, propietarios y residentes." },
      { clave: "estructura", texto: "Estructura física", ruta: "/estructura", descripcion: "Torres, sectores y pisos; estacionamientos y bodegas con su condición y uso; inventario de instalaciones." },
      { clave: "invitaciones", texto: "Invitar residentes", ruta: "/invitaciones", soloAdmin: true, descripcion: "Enlace para que cada residente cree su contraseña, por correo o WhatsApp." },
      { clave: "solicitudes", texto: "Solicitudes de residentes", ruta: "/solicitudes", soloAdmin: true, descripcion: "Código de la comunidad para que los residentes creen su cuenta, y aprobación de quién accede a cada unidad." },
      { clave: "importar", texto: "Cargar desde Excel", ruta: "/importar", soloAdmin: true, descripcion: "Carga de una vez las unidades, porcentajes de prorrateo y personas desde una planilla." },
      { clave: "votaciones", texto: "Votaciones", ruta: "/votaciones", descripcion: "Consultas y votaciones en línea para asambleas, ponderadas por porcentaje de prorrateo." },
    ],
  },
  {
    clave: "remuneraciones",
    texto: "Remuneraciones",
    icono: "remuneraciones",
    modulos: [
      { clave: "remuneraciones", texto: "Remuneraciones", ruta: "/remuneraciones", soloAdmin: true, descripcion: "Personal de la comunidad y carga mensual de sueldos e imposiciones como egresos (sin cálculo de liquidaciones)." },
    ],
  },
];

export const FAVORITOS_INICIALES = ["gasto-comun", "recaudacion", "egresos", "residentes", "votaciones"];

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
