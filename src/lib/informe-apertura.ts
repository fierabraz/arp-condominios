// COM-001 · Entrega 6: contenido del informe de apertura (03.07.11, T-81).
// Puro (sin base de datos ni PDF) para poder probarlo. Solo cifras y conteos: no lleva nombres de
// residentes, propietarios ni acreedores, ni números de cuenta completos. El detalle por unidad
// queda en la pantalla de apertura, que solo ven los administradores (D-COM-09, por decidir).

import {
  ESTADOS_APERTURA,
  ESTADOS_DEUDA,
  ORDEN_ESTADOS_DEUDA,
  saldoAjustado,
  TIPOS_CUENTA,
  TIPOS_OBLIGACION,
  TRAMOS,
  type DatosApertura,
  type EstadoApertura,
  type Resumen,
  type TipoCuenta,
  type TipoObligacion,
} from "./apertura";
import { ESTADOS, MODALIDADES, TIPOS, type Estado, type Modalidad, type Tipo } from "./configuracion";
import { formatoDia, formatoFecha, formatoFechaHora, formatoMoneda, formatoPorcentaje, ETIQUETAS_TIPO_UNIDAD } from "./formato";

export const LEYENDA_INFORME =
  "Documento de control interno generado por Convive. No constituye acta de asamblea ni reemplaza documentos que requieran otras formalidades.";

export const AVISO_BORRADOR =
  "BORRADOR SIN APROBAR. La aprobación de la apertura está restringida hasta que se aprueben las reglas de apertura (D-COM-05 a D-COM-08). Estas cifras todavía no cuentan para cobros, pagos ni intereses.";

export type DatosInforme = {
  administradora: string;
  comunidad: {
    nombre: string;
    direccion: string;
    comuna: string | null;
    tipo: Tipo | null;
    modalidad: Modalidad | null;
    fechaIncorporacion: Date | null;
    estado: Estado;
  };
  apertura: { fechaCorte: Date; estado: EstadoApertura; preparadoPor: string; actualizadoEn: Date; observaciones: string | null };
  estructura: {
    totalDeclarado: number | null;
    unidadesPorTipo: { tipo: keyof typeof ETIQUETAS_TIPO_UNIDAD; cantidad: number }[];
    sumaAlicuotas: number;
    agrupaciones: number;
    espacios: { clase: string; regimen: string; destino: string; cantidad: number }[];
    instalaciones: number;
  };
  personas: { propietarios: number; residentes: number; unidadesSinPropietario: number; unidades: number };
  datos: Omit<DatosApertura, "deudas" | "fondos" | "cuentas" | "obligaciones"> & {
    deudas: (DatosApertura["deudas"][number] & { origen?: string | null; respaldo?: string | null })[];
    fondos: (DatosApertura["fondos"][number] & { nombre: string })[];
    cuentas: (DatosApertura["cuentas"][number] & { tipo: TipoCuenta; banco: string; numeroFinal: string | null })[];
    obligaciones: (DatosApertura["obligaciones"][number] & { tipo: TipoObligacion; documento?: string | null })[];
  };
  resumen: Resumen;
  revision: { bloqueos: string[]; advertencias: string[] };
  /** Requisitos de la habilitación financiera que no se cumplen (paso 08). */
  pendientesActivacion: string[];
  generado: Date;
  generadoPor: string;
};

export type FilaInforme = { celdas: string[]; fuerte?: boolean };
/** Anchos como fracción del ancho útil de la página. */
export type TablaInforme = { columnas: { titulo: string; ancho: number; derecha?: boolean }[]; filas: FilaInforme[] };
export type SeccionInforme = { titulo: string; cifras?: { etiqueta: string; valor: string }[]; tablas?: TablaInforme[]; parrafos?: string[] };
export type Informe = { titulo: string; arriba: string; abajo: string; aviso: string | null; secciones: SeccionInforme[]; leyenda: string };

const $ = (n: number) => formatoMoneda(n);
const n = (x: number, uno: string, varios: string) => `${x.toLocaleString("es-CL")} ${x === 1 ? uno : varios}`;
const dos = (titulo: string, valor: string): FilaInforme => ({ celdas: [titulo, valor] });
const columnasDos = [
  { titulo: "Dato", ancho: 0.35 },
  { titulo: "Valor", ancho: 0.65 },
];

/** Lotes de carga de las deudas: lo ingresado en pantalla y cada planilla (sin la fila). */
export function lotesDeudas(deudas: { origen?: string | null; saldo: number }[]) {
  const lotes = new Map<string, { deudas: number; saldo: number }>();
  for (const d of deudas) {
    const o = d.origen?.trim();
    const lote = !o || o === "pantalla" ? "Ingresadas en pantalla" : `Planilla ${o.replace(/, fila \d+$/, "")}`;
    const l = lotes.get(lote) ?? { deudas: 0, saldo: 0 };
    l.deudas += 1;
    l.saldo += d.saldo;
    lotes.set(lote, l);
  }
  return [...lotes].map(([lote, l]) => ({ lote, ...l })).sort((a, b) => a.lote.localeCompare(b.lote, "es"));
}

const finalCuenta = (f: string | null | undefined) => (f ? `···${f.slice(-4)}` : "");

export function informeApertura(d: DatosInforme): Informe {
  const { comunidad: c, apertura: a, resumen: r, datos } = d;
  const inicio = new Date(a.fechaCorte.getTime() + 86_400_000);
  const secciones: SeccionInforme[] = [];

  secciones.push({
    titulo: "1. Identificación",
    tablas: [
      {
        columnas: columnasDos,
        filas: [
          dos("Comunidad", c.nombre),
          dos("Dirección", [c.direccion, c.comuna].filter(Boolean).join(", ")),
          dos("Tipo", c.tipo ? TIPOS[c.tipo] : "Sin definir"),
          dos("Modalidad", c.modalidad ? MODALIDADES[c.modalidad].texto : "Sin definir"),
          dos("Administración", d.administradora),
          dos("Estado en Convive", ESTADOS[c.estado].texto),
          dos("Fecha de incorporación", c.fechaIncorporacion ? formatoDia(c.fechaIncorporacion) : "Sin definir"),
          dos("Fecha de corte", `${formatoDia(a.fechaCorte)} (último día del sistema anterior)`),
          dos("Inicio en Convive", formatoDia(inicio)),
          dos("Estado de la apertura", ESTADOS_APERTURA[a.estado].texto),
        ],
      },
    ],
  });

  const e = d.estructura;
  const unidades = e.unidadesPorTipo.reduce((s, u) => s + u.cantidad, 0);
  secciones.push({
    titulo: "2. Estructura",
    cifras: [
      { etiqueta: "Unidades cargadas", valor: e.totalDeclarado ? `${unidades} de ${e.totalDeclarado}` : String(unidades) },
      { etiqueta: "Suma de alícuotas", valor: formatoPorcentaje(e.sumaAlicuotas, 2) },
      { etiqueta: "Torres, sectores o pisos", valor: String(e.agrupaciones) },
      { etiqueta: "Instalaciones", valor: String(e.instalaciones) },
    ],
    tablas: [
      {
        columnas: [
          { titulo: "Unidades por tipo", ancho: 0.7 },
          { titulo: "Cantidad", ancho: 0.3, derecha: true },
        ],
        filas: [...e.unidadesPorTipo.map((u) => ({ celdas: [ETIQUETAS_TIPO_UNIDAD[u.tipo], String(u.cantidad)] })), { celdas: ["Total", String(unidades)], fuerte: true }],
      },
      ...(e.espacios.length
        ? [
            {
              columnas: [
                { titulo: "Estacionamientos y bodegas", ancho: 0.3 },
                { titulo: "Condición", ancho: 0.3 },
                { titulo: "Destino", ancho: 0.25 },
                { titulo: "Cantidad", ancho: 0.15, derecha: true },
              ],
              filas: e.espacios.map((x) => ({ celdas: [x.clase, x.regimen, x.destino, String(x.cantidad)] })),
            },
          ]
        : []),
    ],
  });

  const p = d.personas;
  secciones.push({
    titulo: "3. Personas",
    parrafos: ["Solo conteos: este informe no incluye nombres ni datos de contacto."],
    tablas: [
      {
        columnas: columnasDos,
        filas: [
          dos("Propietarios registrados", String(p.propietarios)),
          dos("Residentes registrados", String(p.residentes)),
          dos("Unidades sin propietario conocido", `${p.unidadesSinPropietario} de ${p.unidades}`),
        ],
      },
    ],
  });

  secciones.push({
    titulo: "4. Deudas de unidades a la fecha de corte",
    cifras: [
      { etiqueta: "Total registrado", valor: $(r.deudas.total) },
      { etiqueta: "Por cobrar", valor: $(r.deudas.cobrable) },
      { etiqueta: "Unidades con deuda", valor: String(r.deudas.unidades) },
      { etiqueta: "Registros de deuda", valor: String(r.deudas.cantidad) },
    ],
    tablas: [
      {
        columnas: [
          { titulo: "Por estado", ancho: 0.5 },
          { titulo: "Registros", ancho: 0.2, derecha: true },
          { titulo: "Saldo", ancho: 0.3, derecha: true },
        ],
        filas: [
          ...ORDEN_ESTADOS_DEUDA.map((s) => ({ celdas: [ESTADOS_DEUDA[s].texto, String(r.deudas.porEstado[s].cantidad), $(r.deudas.porEstado[s].monto)] })),
          { celdas: ["Total", String(r.deudas.cantidad), $(r.deudas.total)], fuerte: true },
        ],
      },
      {
        columnas: [
          { titulo: "Antigüedad de lo cobrable (días desde el vencimiento)", ancho: 0.7 },
          { titulo: "Saldo", ancho: 0.3, derecha: true },
        ],
        filas: [
          ...TRAMOS.map((t) => ({ celdas: [t === "por vencer" ? "Por vencer" : `${t} días`, $(r.deudas.porTramo[t])] })),
          { celdas: ["Total cobrable", $(r.deudas.cobrable)], fuerte: true },
        ],
      },
    ],
    parrafos: ["Las deudas discutidas y por verificar se informan aparte y no cuentan como morosidad (D-COM-11, por decidir)."],
  });

  secciones.push({
    titulo: "5. Saldos a favor y pagos por identificar",
    tablas: [
      {
        columnas: columnasDos,
        filas: [dos("Saldos a favor de unidades", $(r.creditos.aFavor)), dos("Pagos recibidos sin identificar", $(r.creditos.porIdentificar))],
      },
    ],
  });

  secciones.push({
    titulo: "6. Fondos",
    tablas: [
      {
        columnas: [
          { titulo: "Fondo", ancho: 0.5 },
          { titulo: "Saldo contable", ancho: 0.25, derecha: true },
          { titulo: "Por recaudar", ancho: 0.25, derecha: true },
        ],
        filas: [
          ...datos.fondos.map((f) => ({ celdas: [f.nombre, $(f.saldoContable), f.pendienteRecaudar ? $(f.pendienteRecaudar) : "—"] })),
          { celdas: ["Total", $(r.fondos.contable), $(r.fondos.pendiente)], fuerte: true },
        ],
      },
    ],
    parrafos: ["Lo pendiente de recaudar son aportes emitidos y no pagados: no es dinero disponible."],
  });

  const cuadre =
    r.cuadre.nivel === "cuadra"
      ? "El banco ajustado calza con el total de los fondos."
      : `Diferencia entre el banco ajustado y los fondos: ${$(r.cuadre.diferencia)}${r.cuadre.nivel === "mayor" ? " (mayor al margen aceptado; según la recomendación D-COM-07 bloquearía la habilitación financiera)" : " (dentro del margen)"}.`;
  secciones.push({
    titulo: "7. Bancos y caja",
    tablas: [
      {
        columnas: [
          { titulo: "Cuenta", ancho: 0.34 },
          { titulo: "Cartola", ancho: 0.165, derecha: true },
          { titulo: "Cheques", ancho: 0.165, derecha: true },
          { titulo: "Depósitos", ancho: 0.165, derecha: true },
          { titulo: "Ajustado", ancho: 0.165, derecha: true },
        ],
        filas: [
          ...datos.cuentas.map((x) => ({
            celdas: [x.tipo === "CAJA" ? `${TIPOS_CUENTA.CAJA} ${x.banco}` : `${x.banco} ${finalCuenta(x.numeroFinal)}`, $(x.saldoCartola), $(x.chequesNoCobrados), $(x.depositosNoAbonados), $(saldoAjustado(x))],
          })),
          { celdas: ["Total", $(r.bancos.cartola), "", "", $(r.bancos.ajustado)], fuerte: true },
        ],
      },
    ],
    parrafos: [
      "Ajustado = cartola, menos cheques girados y no cobrados, más depósitos en tránsito no abonados.",
      cuadre,
    ],
  });

  const porTipo = new Map<TipoObligacion, { cantidad: number; monto: number }>();
  for (const o of datos.obligaciones) {
    const t = porTipo.get(o.tipo) ?? { cantidad: 0, monto: 0 };
    t.cantidad += 1;
    t.monto += o.monto;
    porTipo.set(o.tipo, t);
  }
  secciones.push({
    titulo: "8. Obligaciones con terceros",
    tablas: [
      {
        columnas: [
          { titulo: "Tipo", ancho: 0.5 },
          { titulo: "Documentos", ancho: 0.2, derecha: true },
          { titulo: "Monto", ancho: 0.3, derecha: true },
        ],
        filas: [
          ...[...porTipo].map(([t, x]) => ({ celdas: [TIPOS_OBLIGACION[t], String(x.cantidad), $(x.monto)] })),
          { celdas: ["Total", String(datos.obligaciones.length), $(r.obligaciones.total)], fuerte: true },
        ],
      },
    ],
    parrafos: r.obligaciones.sinFondo ? [`${n(r.obligaciones.sinFondo, "obligación no tiene", "obligaciones no tienen")} fondo asignado para pagarla.`] : [],
  });

  const conRespaldo = datos.deudas.filter((x) => x.respaldo?.trim()).length;
  const conDocumento = datos.obligaciones.filter((x) => x.documento?.trim()).length;
  const lotes = lotesDeudas(datos.deudas);
  secciones.push({
    titulo: "9. Documentos de respaldo y lotes de carga",
    parrafos: [
      `${n(conRespaldo, "deuda tiene", "deudas tienen")} un respaldo anotado y ${n(conDocumento, "obligación tiene", "obligaciones tienen")} número de documento. Los archivos de respaldo se adjuntarán cuando exista el módulo de documentos (paso 07); este informe tampoco queda guardado todavía (ARC-001).`,
    ],
    tablas: lotes.length
      ? [
          {
            columnas: [
              { titulo: "Lote de carga de deudas", ancho: 0.5 },
              { titulo: "Registros", ancho: 0.2, derecha: true },
              { titulo: "Saldo", ancho: 0.3, derecha: true },
            ],
            filas: lotes.map((l) => ({ celdas: [l.lote, String(l.deudas), $(l.saldo)] })),
          },
        ]
      : [],
  });

  const advertencias = [...d.revision.bloqueos, ...d.revision.advertencias, ...d.pendientesActivacion.filter((x) => !d.revision.bloqueos.includes(x))];
  secciones.push({
    titulo: "10. Advertencias",
    parrafos: advertencias.length ? advertencias.map((x) => `• ${x}`) : ["Sin advertencias."],
  });

  secciones.push({
    titulo: "11. Preparación y aprobación",
    tablas: [
      {
        columnas: columnasDos,
        filas: [
          dos("Preparada por", a.preparadoPor),
          dos("Última modificación", formatoFechaHora(a.actualizadoEn)),
          dos("Aprobada por", "Pendiente: la aprobación está restringida (D-COM-05 a D-COM-08)"),
          dos("Generado por", d.generadoPor),
          dos("Generado el", formatoFechaHora(d.generado)),
        ],
      },
    ],
    parrafos: a.observaciones ? [`Observaciones de la apertura: ${a.observaciones}`] : [],
  });

  return {
    titulo: "Informe de apertura",
    arriba: `${d.administradora} · ${c.nombre}`,
    abajo: `Corte al ${formatoFecha(a.fechaCorte)} · Inicio en Convive el ${formatoFecha(inicio)} · ${ESTADOS_APERTURA[a.estado].texto}`,
    // Mientras no exista la aprobación, todo informe es un borrador.
    aviso: AVISO_BORRADOR,
    secciones,
    leyenda: LEYENDA_INFORME,
  };
}

/** Todo el texto del informe, en orden (para pruebas y para revisar que no lleve datos personales). */
export const textoInforme = (i: Informe) =>
  [
    i.titulo,
    i.arriba,
    i.abajo,
    i.aviso ?? "",
    ...i.secciones.flatMap((s) => [
      s.titulo,
      ...(s.cifras ?? []).flatMap((c) => [c.etiqueta, c.valor]),
      ...(s.tablas ?? []).flatMap((t) => [...t.columnas.map((c) => c.titulo), ...t.filas.flatMap((f) => f.celdas)]),
      ...(s.parrafos ?? []),
    ]),
    i.leyenda,
  ].join("\n");
