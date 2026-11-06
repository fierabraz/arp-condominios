// RES-001 · Reserva de espacios comunes: reglas y calendario.
// Todo es puro (sin base de datos) para poder probarlo; lo que toca la base está en reservas-servicio.ts.
// Las fechas de reserva son días "AAAA-MM-DD" (en la base, el día a medianoche UTC).

export type EstadoReserva = "PENDIENTE" | "CONFIRMADA" | "RECHAZADA" | "CANCELADA";
export type CobroReserva = "SIN_COBRO" | "POR_CARGAR" | "CARGADO" | "ANULADO";

export const ESTADOS_RESERVA: Record<EstadoReserva, { texto: string; tono: "alerta" | "exito" | "peligro" | "neutro" }> = {
  PENDIENTE: { texto: "Por aprobar", tono: "alerta" },
  CONFIRMADA: { texto: "Confirmada", tono: "exito" },
  RECHAZADA: { texto: "Rechazada", tono: "peligro" },
  CANCELADA: { texto: "Cancelada", tono: "neutro" },
};

export const COBROS_RESERVA: Record<CobroReserva, string> = {
  SIN_COBRO: "Sin costo",
  POR_CARGAR: "Se sumará al aviso del mes",
  CARGADO: "Sumado al aviso del mes",
  ANULADO: "Sin cobro (no se realizó)",
};

/** Las reservas que ocupan el turno: las que esperan aprobación y las confirmadas. */
export const ESTADOS_QUE_OCUPAN: EstadoReserva[] = ["PENDIENTE", "CONFIRMADA"];
export const ocupaTurno = (estado: EstadoReserva) => ESTADOS_QUE_OCUPAN.includes(estado);

export const TURNO_DIA_COMPLETO = "Día completo";
export const CATEGORIA_GASTO_RESERVA = "Reserva de espacio común";

/** "Almuerzo (12:00 a 17:00)\nNoche" → ["Almuerzo (12:00 a 17:00)", "Noche"]. Vacío → día completo. */
export function leerTurnos(texto: string | undefined | null): string[] {
  const turnos = (texto ?? "")
    .split(/\r?\n/)
    .map((t) => t.trim().replace(/\s+/g, " "))
    .filter(Boolean);
  // Si se repite (sin importar mayúsculas), queda la primera forma escrita.
  const unicos = turnos.filter((t, i) => turnos.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i);
  return unicos.length ? unicos : [TURNO_DIA_COMPLETO];
}

// ── Fechas como "AAAA-MM-DD" ──

const pad = (n: number) => String(n).padStart(2, "0");
export const diaTexto = (anio: number, mes: number, dia: number) => `${anio}-${pad(mes)}-${pad(dia)}`;
export const diaDeFecha = (fecha: Date) => fecha.toISOString().slice(0, 10);
export const fechaDeDia = (dia: string) => new Date(`${dia}T00:00:00Z`);
export const esDia = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && diaDeFecha(fechaDeDia(s)) === s;

export function sumarDias(dia: string, n: number) {
  const f = fechaDeDia(dia);
  f.setUTCDate(f.getUTCDate() + n);
  return diaDeFecha(f);
}

export const diasEnMes = (anio: number, mes: number) => new Date(Date.UTC(anio, mes, 0)).getUTCDate();

/** "2026-11" → { anio: 2026, mes: 11 }; algo inválido → el mes de `porDefecto`. */
export function leerMes(texto: unknown, porDefecto: string): { anio: number; mes: number } {
  const m = typeof texto === "string" ? /^(\d{4})-(\d{2})$/.exec(texto) : null;
  if (m && +m[2] >= 1 && +m[2] <= 12) return { anio: +m[1], mes: +m[2] };
  return { anio: +porDefecto.slice(0, 4), mes: +porDefecto.slice(5, 7) };
}

export function mesVecino(anio: number, mes: number, delta: number) {
  const total = anio * 12 + (mes - 1) + delta;
  return { anio: Math.floor(total / 12), mes: (total % 12) + 1 };
}
export const mesTexto = (anio: number, mes: number) => `${anio}-${pad(mes)}`;

// ── Calendario ──

export type EstadoDia = "libre" | "parcial" | "ocupado" | "fuera";

export type DiaCalendario = {
  dia: string;
  numero: number;
  estado: EstadoDia;
  turnosLibres: string[];
  hoy: boolean;
};

export type ReservaCalendario = { fecha: string; turno: string; estado: EstadoReserva };

/** Desde qué día y hasta qué día se puede reservar el espacio. */
export function ventanaReserva(hoy: string, anticipacionMaximaDias: number) {
  return { desde: hoy, hasta: sumarDias(hoy, Math.max(0, anticipacionMaximaDias)) };
}

/**
 * Los días del mes con su estado: libre (todos los turnos libres), parcial (queda alguno),
 * ocupado (ninguno) o fuera (pasado o más allá del plazo para reservar).
 * Las semanas parten el lunes; los huecos antes del día 1 y después del último son null.
 */
export function calendarioMes({
  anio,
  mes,
  turnos,
  reservas,
  hoy,
  hasta,
}: {
  anio: number;
  mes: number;
  turnos: string[];
  reservas: ReservaCalendario[];
  hoy: string;
  hasta: string;
}): (DiaCalendario | null)[][] {
  const tomados = new Map<string, Set<string>>();
  for (const r of reservas) {
    if (!ocupaTurno(r.estado)) continue;
    if (!tomados.has(r.fecha)) tomados.set(r.fecha, new Set());
    tomados.get(r.fecha)!.add(r.turno);
  }
  const total = diasEnMes(anio, mes);
  // getUTCDay: 0 = domingo. Lunes primero: lunes = 0 ... domingo = 6.
  const blancos = (new Date(Date.UTC(anio, mes - 1, 1)).getUTCDay() + 6) % 7;
  const celdas: (DiaCalendario | null)[] = Array(blancos).fill(null);
  for (let d = 1; d <= total; d++) {
    const dia = diaTexto(anio, mes, d);
    const ocupados = tomados.get(dia) ?? new Set<string>();
    const turnosLibres = turnos.filter((t) => !ocupados.has(t));
    const fuera = dia < hoy || dia > hasta;
    const estado: EstadoDia = fuera
      ? "fuera"
      : turnosLibres.length === 0
        ? "ocupado"
        : turnosLibres.length === turnos.length
          ? "libre"
          : "parcial";
    celdas.push({ dia, numero: d, estado, turnosLibres: fuera ? [] : turnosLibres, hoy: dia === hoy });
  }
  while (celdas.length % 7 !== 0) celdas.push(null);
  const semanas: (DiaCalendario | null)[][] = [];
  for (let i = 0; i < celdas.length; i += 7) semanas.push(celdas.slice(i, i + 7));
  return semanas;
}

// ── Reglas para reservar ──

export type ReglasEspacio = {
  activo: boolean;
  turnos: string[];
  anticipacionMaximaDias: number;
  maximoPorMes: number | null;
  bloquearMorosos: boolean;
};

/**
 * Revisa si la unidad puede reservar ese día y turno. Devuelve el motivo si no puede, o null.
 * `turnoTomado`: ya hay una reserva por aprobar o confirmada en ese turno.
 * `reservasDelMes`: reservas por aprobar o confirmadas de la unidad en ese espacio y ese mes.
 * La administración puede saltarse el plazo y el límite mensual, pero nunca un turno tomado.
 */
export function motivoNoReservable(
  reglas: ReglasEspacio,
  datos: {
    dia: string;
    turno: string;
    hoy: string;
    turnoTomado: boolean;
    reservasDelMes: number;
    deudaVencida: number;
    porAdministracion?: boolean;
  },
): string | null {
  if (!reglas.activo) return "Este espacio no está disponible para reservas.";
  if (!esDia(datos.dia)) return "Elige un día válido.";
  if (!reglas.turnos.includes(datos.turno)) return "Elige uno de los turnos del espacio.";
  if (datos.dia < datos.hoy) return "No se puede reservar un día que ya pasó.";
  if (datos.turnoTomado) return "Ese turno ya está reservado. Elige otro día u otro turno.";
  if (datos.porAdministracion) return null;
  const { hasta } = ventanaReserva(datos.hoy, reglas.anticipacionMaximaDias);
  if (datos.dia > hasta) return `Se puede reservar con hasta ${reglas.anticipacionMaximaDias} días de anticipación.`;
  if (reglas.maximoPorMes !== null && datos.reservasDelMes >= reglas.maximoPorMes) {
    return reglas.maximoPorMes === 1
      ? "Tu unidad ya tiene una reserva de este espacio ese mes (el máximo es una)."
      : `Tu unidad ya tiene ${datos.reservasDelMes} reservas de este espacio ese mes (el máximo es ${reglas.maximoPorMes}).`;
  }
  if (reglas.bloquearMorosos && datos.deudaVencida > 0) {
    return "Tu unidad tiene cobros vencidos sin pagar. Según las reglas de la comunidad, no puede reservar hasta ponerse al día.";
  }
  return null;
}

/** Estado con que nace una reserva. */
export function estadoInicial(requiereAprobacion: boolean, porAdministracion: boolean): EstadoReserva {
  return requiereAprobacion && !porAdministracion ? "PENDIENTE" : "CONFIRMADA";
}

/**
 * Mes donde va el cargo de una reserva confirmada con costo: el mes de la reserva si está abierto;
 * si ya se emitió, el siguiente mes abierto. Si no hay ninguno, espera (null) a que se abra.
 */
export function periodoParaCargo<P extends { anio: number; mes: number; estado: "ABIERTO" | "CERRADO" }>(
  dia: string,
  periodos: P[],
): P | null {
  const clave = (anio: number, mes: number) => anio * 12 + mes;
  const desde = clave(+dia.slice(0, 4), +dia.slice(5, 7));
  return (
    periodos
      .filter((p) => p.estado === "ABIERTO" && clave(p.anio, p.mes) >= desde)
      .sort((a, b) => clave(a.anio, a.mes) - clave(b.anio, b.mes))[0] ?? null
  );
}

/** Si la reserva todavía se puede cancelar, o el motivo por el que no. */
export function motivoNoCancelable(
  r: { estado: EstadoReserva; fecha: string; cobro: CobroReserva; periodoCargoCerrado: boolean },
  hoy: string,
  porAdministracion: boolean,
): string | null {
  if (!ocupaTurno(r.estado)) return "Esta reserva ya no está vigente.";
  if (!porAdministracion && r.fecha < hoy) return "La fecha de la reserva ya pasó.";
  if (r.cobro === "CARGADO" && r.periodoCargoCerrado) {
    return porAdministracion
      ? null
      : "El cobro de esta reserva ya salió en tu aviso de cobro. Para cancelarla, contacta a la administración.";
  }
  return null;
}

/**
 * Mensaje que se muestra después de reservar o aprobar (la página se vuelve a cargar con
 * ?hecha=<id>, porque si el día quedó lleno el formulario ya no aparece).
 */
export function textoReservaHecha(
  r: {
    estado: EstadoReserva;
    cobro: CobroReserva;
    espacio: string;
    fecha: string;
    turno: string;
    monto: string;
    mesCargo: string | null;
    unidad?: string;
  },
  paraResidente: boolean,
): string {
  const que = `${r.espacio}, ${r.fecha}, turno ${r.turno}${r.unidad ? `, unidad ${r.unidad}` : ""}`;
  const tu = paraResidente ? "a tu" : "al";
  const cobro =
    r.cobro === "CARGADO" && r.mesCargo
      ? ` Se sumarán ${r.monto} ${tu} aviso de cobro de ${r.mesCargo}.`
      : r.cobro === "POR_CARGAR"
        ? r.estado === "PENDIENTE"
          ? ` Si se aprueba, se sumarán ${r.monto} ${tu} aviso de cobro.`
          : ` Se sumarán ${r.monto} ${tu} aviso de cobro cuando se abra el mes${paraResidente ? "" : " (en Gasto común)"}.`
        : "";
  if (r.estado === "PENDIENTE") {
    return `Listo: pediste ${que}. La administración debe aprobarla; verás la respuesta aquí en “Mis reservas”.${cobro}`;
  }
  return `Reserva confirmada: ${que}.${cobro}`;
}
