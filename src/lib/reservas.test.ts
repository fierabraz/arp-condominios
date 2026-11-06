import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  calendarioMes,
  estadoInicial,
  leerTurnos,
  motivoNoCancelable,
  motivoNoReservable,
  periodoParaCargo,
  TURNO_DIA_COMPLETO,
  type ReglasEspacio,
} from "./reservas";

const reglas: ReglasEspacio = {
  activo: true,
  turnos: ["Almuerzo", "Noche"],
  anticipacionMaximaDias: 30,
  maximoPorMes: 2,
  bloquearMorosos: false,
};
const base = { dia: "2026-11-20", turno: "Noche", hoy: "2026-11-06", turnoTomado: false, reservasDelMes: 0, deudaVencida: 0 };

describe("turnos (RES-001)", () => {
  test("uno por línea, sin repetidos ni líneas vacías; vacío = día completo", () => {
    assert.deepEqual(leerTurnos("Almuerzo (12:00 a 17:00)\n\n  Noche  \nnoche"), ["Almuerzo (12:00 a 17:00)", "Noche"]);
    assert.deepEqual(leerTurnos(""), [TURNO_DIA_COMPLETO]);
    assert.deepEqual(leerTurnos(undefined), [TURNO_DIA_COMPLETO]);
  });
});

describe("calendario del mes", () => {
  const semanas = calendarioMes({
    anio: 2026,
    mes: 11,
    turnos: ["Almuerzo", "Noche"],
    reservas: [
      { fecha: "2026-11-14", turno: "Almuerzo", estado: "CONFIRMADA" },
      { fecha: "2026-11-14", turno: "Noche", estado: "PENDIENTE" },
      { fecha: "2026-11-15", turno: "Noche", estado: "CONFIRMADA" },
      { fecha: "2026-11-16", turno: "Noche", estado: "CANCELADA" },
      { fecha: "2026-11-17", turno: "Almuerzo", estado: "RECHAZADA" },
    ],
    hoy: "2026-11-06",
    hasta: "2026-11-30",
  });
  const dia = (d: string) => semanas.flat().find((x) => x?.dia === d)!;

  test("semanas de lunes a domingo: noviembre 2026 parte el domingo 1", () => {
    assert.equal(semanas[0].length, 7);
    assert.equal(semanas[0].filter((x) => x === null).length, 6);
    assert.equal(semanas[0][6]?.dia, "2026-11-01");
    assert.ok(semanas.every((s) => s.length === 7));
  });

  test("libre, queda un turno, ocupado (también si una reserva espera aprobación)", () => {
    assert.equal(dia("2026-11-14").estado, "ocupado");
    assert.equal(dia("2026-11-15").estado, "parcial");
    assert.deepEqual(dia("2026-11-15").turnosLibres, ["Almuerzo"]);
    assert.equal(dia("2026-11-20").estado, "libre");
  });

  test("las reservas canceladas o rechazadas liberan el turno", () => {
    assert.equal(dia("2026-11-16").estado, "libre");
    assert.equal(dia("2026-11-17").estado, "libre");
  });

  test("los días pasados no se pueden reservar; hoy sí", () => {
    assert.equal(dia("2026-11-05").estado, "fuera");
    assert.equal(dia("2026-11-06").estado, "libre");
    assert.equal(dia("2026-11-06").hoy, true);
  });

  test("más allá del plazo para reservar: no disponible", () => {
    const corto = calendarioMes({ anio: 2026, mes: 11, turnos: ["Día completo"], reservas: [], hoy: "2026-11-06", hasta: "2026-11-10" });
    assert.equal(corto.flat().find((x) => x?.dia === "2026-11-10")!.estado, "libre");
    assert.equal(corto.flat().find((x) => x?.dia === "2026-11-11")!.estado, "fuera");
  });
});

describe("reglas para reservar", () => {
  test("un turno libre dentro del plazo se puede reservar", () => {
    assert.equal(motivoNoReservable(reglas, base), null);
  });
  test("turno tomado: nadie lo puede reservar, tampoco la administración", () => {
    assert.match(motivoNoReservable(reglas, { ...base, turnoTomado: true })!, /ya está reservado/);
    assert.match(motivoNoReservable(reglas, { ...base, turnoTomado: true, porAdministracion: true })!, /ya está reservado/);
  });
  test("día pasado, turno inexistente o espacio cerrado", () => {
    assert.match(motivoNoReservable(reglas, { ...base, dia: "2026-11-05" })!, /ya pasó/);
    assert.match(motivoNoReservable(reglas, { ...base, turno: "Mañana" })!, /turnos/);
    assert.match(motivoNoReservable({ ...reglas, activo: false }, base)!, /no está disponible/);
    assert.match(motivoNoReservable(reglas, { ...base, dia: "2026-02-30" })!, /día válido/);
  });
  test("plazo máximo y máximo por mes; la administración puede saltárselos", () => {
    assert.match(motivoNoReservable(reglas, { ...base, dia: "2026-12-07" })!, /30 días/);
    assert.equal(motivoNoReservable(reglas, { ...base, dia: "2026-12-06" }), null);
    assert.match(motivoNoReservable(reglas, { ...base, reservasDelMes: 2 })!, /máximo es 2/);
    assert.equal(motivoNoReservable(reglas, { ...base, dia: "2027-01-10", reservasDelMes: 5, porAdministracion: true }), null);
  });
  test("deuda vencida solo bloquea si el espacio lo pide", () => {
    assert.equal(motivoNoReservable(reglas, { ...base, deudaVencida: 1 }), null);
    assert.match(motivoNoReservable({ ...reglas, bloquearMorosos: true }, { ...base, deudaVencida: 1 })!, /cobros vencidos/);
  });
  test("estado inicial: por aprobar solo si el espacio lo exige y la pide el residente", () => {
    assert.equal(estadoInicial(true, false), "PENDIENTE");
    assert.equal(estadoInicial(true, true), "CONFIRMADA");
    assert.equal(estadoInicial(false, false), "CONFIRMADA");
  });
});

describe("mes donde se carga el cobro", () => {
  const periodos = [
    { id: "oct", anio: 2026, mes: 10, estado: "CERRADO" as const },
    { id: "nov", anio: 2026, mes: 11, estado: "CERRADO" as const },
    { id: "dic", anio: 2026, mes: 12, estado: "ABIERTO" as const },
    { id: "ene", anio: 2027, mes: 1, estado: "ABIERTO" as const },
  ];
  test("el mes de la reserva si está abierto", () => {
    assert.equal(periodoParaCargo("2026-12-20", periodos)?.id, "dic");
    assert.equal(periodoParaCargo("2027-01-02", periodos)?.id, "ene");
  });
  test("si el mes de la reserva ya se emitió, el siguiente abierto", () => {
    assert.equal(periodoParaCargo("2026-11-20", periodos)?.id, "dic");
  });
  test("si no hay un mes abierto desde el de la reserva, espera", () => {
    assert.equal(periodoParaCargo("2027-02-14", periodos), null);
  });
});

describe("cancelar", () => {
  const vigente = { estado: "CONFIRMADA" as const, fecha: "2026-11-20", cobro: "CARGADO" as const, periodoCargoCerrado: false };
  test("el residente cancela una reserva futura con cobro en un mes abierto", () => {
    assert.equal(motivoNoCancelable(vigente, "2026-11-06", false), null);
  });
  test("si el cobro ya salió en un aviso, solo la administración", () => {
    const emitida = { ...vigente, periodoCargoCerrado: true };
    assert.match(motivoNoCancelable(emitida, "2026-11-06", false)!, /contacta a la administración/);
    assert.equal(motivoNoCancelable(emitida, "2026-11-06", true), null);
  });
  test("no se cancela una reserva pasada (residente) ni una ya cancelada", () => {
    assert.match(motivoNoCancelable(vigente, "2026-11-21", false)!, /ya pasó/);
    assert.match(motivoNoCancelable({ ...vigente, estado: "CANCELADA" }, "2026-11-06", true)!, /no está vigente/);
  });
});
