import { test } from "node:test";
import assert from "node:assert/strict";
import {
  leerCsv,
  leerFecha,
  leerNumero,
  leerPlanilla,
  leerRelacion,
  letraColumna,
  perfilQueCalza,
  planificar,
  resumenPlan,
  revisarMapeo,
  type Mapeo,
} from "./importacion";

const TITULOS = ["Unidad", "Tipo", "Alícuota (%)", "Nombre", "RUT", "Correo", "Teléfono", "Relación"];
const vacio = { unidades: [], personas: [], vinculos: [] };

test("leerNumero entiende coma decimal, puntos de miles y signo %", () => {
  assert.equal(leerNumero("1,25"), 1.25);
  assert.equal(leerNumero("1.25"), 1.25);
  assert.equal(leerNumero("2,5 %"), 2.5);
  assert.equal(leerNumero(3), 3);
  assert.equal(leerNumero("abc"), null);
});

test("leerPlanilla reconoce títulos con otro nombre, salta filas vacías y lee relaciones", () => {
  const r = leerPlanilla([
    ["Planilla de copropietarios"],
    ["Depto", "Prorrateo", "Nombre completo", "Email", "Celular", "Calidad"],
    ["101", "2,5", "Ana Pérez", "ANA@MAIL.CL", "+56 9 1111 2222", "Dueña"],
    [null, null, null, null, null, null],
    ["102", 2.5, "Luis Soto", "", "", "Arrendatario"],
    ["103", 2.5, "Eva Rojas", "", "", "Ambos"],
    ["B-1", 0.5, "", "", "", ""],
  ]);
  assert.deepEqual(r.errores, []);
  assert.equal(r.filas.length, 4);
  assert.equal(r.filas[0].correo, "ana@mail.cl");
  assert.deepEqual(r.filas[0].relaciones, ["PROPIETARIO"]);
  assert.deepEqual(r.filas[1].relaciones, ["ARRENDATARIO"]);
  assert.deepEqual(r.filas[2].relaciones, ["PROPIETARIO", "RESIDENTE"]);
  assert.equal(r.filas[3].nombre, undefined);
  assert.equal(r.filas[0].fila, 3);
});

test("leerPlanilla informa errores por fila", () => {
  const r = leerPlanilla([
    TITULOS,
    ["", "Casa", 1, "Sin unidad"],
    ["201", "Castillo", 1, "Ana"],
    ["202", "", "-3", "Luis", "", "luis@", "", "Jefe"],
    ["203", "", 1, "", "11.111.111-1"],
  ]);
  assert.equal(r.filas.length, 0);
  assert.equal(r.errores.length, 4);
  assert.match(r.errores[0].mensaje, /número de la unidad/);
  assert.match(r.errores[1].mensaje, /tipo "Castillo"/);
  assert.match(r.errores[2].mensaje, /alícuota.*correo.*relación/);
  assert.match(r.errores[3].mensaje, /falta su nombre/);
});

test("leerPlanilla sin columna Unidad avisa que no encontró los títulos", () => {
  const r = leerPlanilla([["Nombre", "Correo"], ["Ana", "a@b.cl"]]);
  assert.equal(r.sinTitulos, true);
  assert.match(r.errores[0].mensaje, /Unidad/);
});

test("alícuotas escritas como fracción se pasan a porcentaje", () => {
  const r = leerPlanilla([TITULOS, ["1", "", 0.25], ["2", "", 0.25], ["3", "", 0.5]]);
  assert.deepEqual(r.filas.map((f) => f.alicuota), [25, 25, 50]);
  assert.equal(r.avisos.length, 1);
});

test("leerCsv separa por punto y coma y respeta comillas", () => {
  const filas = leerCsv('﻿Unidad;Nombre\r\n101;"Pérez; Ana"\r\n102;"Dice ""hola"""\n');
  assert.deepEqual(filas, [["Unidad", "Nombre"], ["101", "Pérez; Ana"], ["102", 'Dice "hola"']]);
});

test("planificar crea unidades y reconoce a la misma persona por RUT en varias unidades", () => {
  const { filas } = leerPlanilla([
    TITULOS,
    ["101", "", 50, "Ana Pérez", "11.111.111-1", "ana@mail.cl", "", "Propietario"],
    ["102", "", 50, "Ana Pérez", "11111111-1", "", "", "Propietario"],
    ["102", "", "", "Luis Soto", "", "luis@mail.cl", "", "Residente"],
  ]);
  const plan = planificar(filas, vacio);
  assert.deepEqual(plan.errores, []);
  assert.equal(plan.unidades.length, 2);
  assert.equal(plan.personas.length, 2);
  assert.equal(plan.vinculos.length, 3);
  assert.equal(plan.sumaAlicuotas, 100);
  assert.deepEqual(resumenPlan(plan), {
    unidadesNuevas: 2,
    unidadesActualizadas: 0,
    personasNuevas: 2,
    personasCompletadas: 0,
    vinculosNuevos: 3,
  });
});

test("planificar actualiza lo existente, completa datos vacíos y no repite vínculos", () => {
  const { filas } = leerPlanilla([
    TITULOS,
    ["101", "", 40, "Ana P.", "", "ana@mail.cl", "+56911112222", "Propietario"],
    ["102", "", "", "Luis", "", "", "", ""],
  ]);
  const plan = planificar(filas, {
    unidades: [
      { id: "u1", numero: "101", tipo: "DEPARTAMENTO", alicuota: 50 },
      { id: "u2", numero: "102", tipo: "DEPARTAMENTO", alicuota: 50 },
    ],
    personas: [{ id: "p1", nombre: "Ana Pérez", documento: null, correo: "ana@mail.cl", telefono: null }],
    vinculos: [{ unidadId: "u1", personaId: "p1", relacion: "PROPIETARIO" }],
  });
  assert.deepEqual(plan.errores, []);
  const [u101, u102] = plan.unidades;
  assert.equal(u101.accion, "actualizar");
  assert.equal(u102.accion, "igual"); // sin alícuota en la planilla: queda la que tenía
  const ana = plan.personas.find((p) => p.id === "p1")!;
  assert.equal(ana.accion, "completar");
  assert.equal(ana.nombre, "Ana Pérez"); // el nombre registrado no se cambia
  assert.deepEqual(ana.completar, { documento: undefined, correo: undefined, telefono: "+56911112222" });
  assert.equal(plan.vinculos.find((v) => v.persona === ana.clave)!.nuevo, false);
  assert.equal(plan.sumaAlicuotas, 90);
});

test("planificar rechaza unidades nuevas sin alícuota y repetidas con otra alícuota", () => {
  const { filas } = leerPlanilla([TITULOS, ["301"], ["302", "", 10], ["302", "", 20, "Ana"]]);
  const plan = planificar(filas, vacio);
  assert.equal(plan.errores.length, 2);
  assert.match(plan.errores[0].mensaje, /falta la alícuota/);
  assert.match(plan.errores[1].mensaje, /distinto tipo o alícuota/);
});

test("al volver a subir, una persona sin RUT ni correo se reconoce por su nombre en la misma unidad", () => {
  const { filas } = leerPlanilla([TITULOS, ["104", "", 10, "Rosa  Vera"], ["105", "", 10, "rosa vera"]]);
  const plan = planificar(filas, {
    unidades: [{ id: "u4", numero: "104", tipo: "DEPARTAMENTO", alicuota: 10 }],
    personas: [{ id: "p9", nombre: "Rosa Vera", documento: null, correo: null, telefono: null }],
    vinculos: [{ unidadId: "u4", personaId: "p9", relacion: "PROPIETARIO" }],
  });
  assert.equal(plan.personas.length, 1);
  assert.equal(plan.personas[0].id, "p9");
  assert.deepEqual(plan.vinculos.map((v) => v.nuevo), [false, true]);
  assert.equal(resumenPlan(plan).personasNuevas, 0);
});

// ── COM-001 · Entrega 4 ──

test("la relación acepta los cinco vínculos, combinados o abreviados", () => {
  assert.deepEqual(leerRelacion(""), ["PROPIETARIO"]);
  assert.deepEqual(leerRelacion("Propietario y residente"), ["PROPIETARIO", "RESIDENTE"]);
  assert.deepEqual(leerRelacion("Copropietaria"), ["COPROPIETARIO"]);
  assert.deepEqual(leerRelacion("Inquilino"), ["ARRENDATARIO"]);
  assert.deepEqual(leerRelacion("Ocupante"), ["OCUPANTE"]);
  assert.deepEqual(leerRelacion("P / R"), ["PROPIETARIO", "RESIDENTE"]);
  assert.equal(leerRelacion("Jefe"), null);
});

test("fechas: de Excel, dd-mm-aaaa, d/m/aaaa o aaaa-mm-dd; nada de fechas imposibles", () => {
  assert.equal(leerFecha("01-03-2026"), "2026-03-01");
  assert.equal(leerFecha("1/3/2026"), "2026-03-01");
  assert.equal(leerFecha("2026-03-01"), "2026-03-01");
  assert.equal(leerFecha(new Date("2026-03-01T00:00:00Z")), "2026-03-01");
  assert.equal(leerFecha("31-02-2026"), null);
  assert.equal(leerFecha("marzo"), null);
  assert.equal(letraColumna(0), "A");
  assert.equal(letraColumna(27), "AB");
});

test("los errores dicen hoja, fila y columna; la fecha futura y las fórmulas no pasan", () => {
  const r = leerPlanilla(
    [
      [...TITULOS, "Desde"],
      ["101", "", 10, "Ana", "", "", "", "Arrendataria", "15-03-2026"],
      ["102", "", 10, "Luis", "", "", "", "", "01-12-2026"],
      ["103", "", 10, "=HYPERLINK(\"x\")", "", "", "", "", ""],
      ["104", "", "mucho", "Eva", "", "", "", "", ""],
    ],
    { hoja: "Unidades", hoy: "2026-11-06" },
  );
  assert.equal(r.filas.length, 1);
  assert.equal(r.filas[0].desde, "2026-03-15");
  assert.deepEqual(r.filas[0].relaciones, ["ARRENDATARIO"]);
  assert.equal(r.errores.length, 3);
  assert.ok(r.errores.every((e) => e.hoja === "Unidades"));
  assert.match(r.errores[0].mensaje, /futura \(columna I, "Desde"\)/);
  assert.match(r.errores[1].mensaje, /"=" ni "@"/);
  assert.match(r.errores[2].mensaje, /columna C, "Alícuota \(%\)"/);
  assert.equal(r.errores[2].fila, 5);
});

test("planilla propia: sin columna reconocible pide asignarlas; con la asignación se lee", () => {
  const hoja = [
    ["Listado copropiedad"],
    ["Dpto.", "% Part.", "Titular", "Mail titular", "Obs"],
    ["11", "50", "Ana Ficticia", "ana@ejemplo.cl", "pagó"],
    ["12", "50", "Luis Ficticio", "", ""],
  ];
  const sin = leerPlanilla(hoja);
  assert.equal(sin.sinTitulos, true);
  // Se salta el título "Listado copropiedad": la fila con más celdas es la de títulos.
  assert.deepEqual(
    sin.columnas!.map((c) => [c.letra, c.titulo, c.ejemplos[0]]),
    [
      ["A", "Dpto.", "11"],
      ["B", "% Part.", "50"],
      ["C", "Titular", "Ana Ficticia"],
      ["D", "Mail titular", "ana@ejemplo.cl"],
      ["E", "Obs", "pagó"],
    ],
  );
  const mapeo = { dpto: "numero", part: "alicuota", titular: "nombre", mailtitular: "correo", obs: "ignorar" } as const;
  const con = leerPlanilla(hoja, { mapeo });
  assert.deepEqual(con.errores, []);
  assert.equal(con.filas.length, 2);
  assert.equal(con.filas[0].correo, "ana@ejemplo.cl");
  assert.equal(con.filas[1].alicuota, 50);
  assert.deepEqual(con.avisos, []); // "Obs" se ignoró a propósito
});

test("perfiles: calza el que tiene todos sus títulos; la asignación necesita la unidad y sin repetir", () => {
  const hoja = [["Dpto.", "% Part.", "Titular"], ["11", 50, "Ana"]];
  const perfiles: { id: string; columnas: Mapeo }[] = [
    { id: "a", columnas: { dpto: "numero", titular: "nombre" } },
    { id: "b", columnas: { dpto: "numero", part: "alicuota", titular: "nombre" } },
    { id: "c", columnas: { depto: "numero", rut: "documento" } },
    { id: "d", columnas: { titular: "nombre" } },
  ];
  assert.equal(perfilQueCalza(hoja, perfiles)?.id, "b");
  assert.equal(perfilQueCalza([["Otra", "Cosa"]], perfiles), null);
  assert.match(revisarMapeo({ titular: "nombre" })!, /unidad/);
  assert.match(revisarMapeo({ a: "numero", b: "nombre", c: "nombre" })!, /dos columnas/);
  assert.equal(revisarMapeo({ a: "numero", b: "ignorar", c: "ignorar" }), null);
});

test("la carga aplica las reglas de vínculos de la Entrega 3", () => {
  const { filas } = leerPlanilla([
    TITULOS,
    ["101", "", 50, "Ana", "1-9", "", "", "Propietario"],
    ["101", "", "", "Luis", "2-7", "", "", "Propietario"],
    ["101", "", "", "Ana", "1-9", "", "", "Arrendatario"],
    ["102", "", 50, "Eva", "3-5", "", "", "Copropietario"],
    ["102", "", "", "Pía", "4-3", "", "", "Ocupante"],
  ]);
  const plan = planificar(filas, {
    unidades: [{ id: "u2", numero: "102", tipo: "DEPARTAMENTO", alicuota: 50 }],
    personas: [{ id: "p9", nombre: "Eva Ficticia", documento: "3-5", correo: null, telefono: null }],
    vinculos: [{ unidadId: "u2", personaId: "p9", relacion: "PROPIETARIO" }],
  });
  assert.equal(plan.errores.length, 3);
  assert.match(plan.errores[0].mensaje, /Ana ya figura como propietario/);
  assert.match(plan.errores[1].mensaje, /no puede ser también su arrendatario/);
  assert.match(plan.errores[2].mensaje, /Ya es dueño/);
  assert.deepEqual(
    plan.vinculos.filter((v) => v.nuevo).map((v) => v.relacion),
    ["PROPIETARIO", "OCUPANTE"],
  );
});
