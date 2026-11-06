import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularCupo, textoCupo } from "./planes";

const esencialPro = { nombre: "Esencial Pro", maxComunidades: 3 };

test("sin plan asignado: sin límite, como antes", () => {
  const c = calcularCupo({ creaComunidades: true, plan: null }, 40);
  assert.equal(c.puede, true);
  assert.equal(c.limite, null);
  assert.equal(c.restantes, null);
  assert.equal(textoCupo(c), "40 (sin límite)");
});

test("dentro del cupo puede crear y sabe cuántas le quedan", () => {
  const c = calcularCupo({ creaComunidades: true, plan: esencialPro }, 2);
  assert.equal(c.puede, true);
  assert.equal(c.restantes, 1);
  assert.equal(textoCupo(c), "2 de 3");
});

test("al llegar al límite no puede y el aviso lo explica", () => {
  const c = calcularCupo({ creaComunidades: true, plan: esencialPro }, 3);
  assert.equal(c.puede, false);
  assert.equal(c.restantes, 0);
  assert.match(c.motivo!, /Tu plan Esencial Pro permite 3 comunidades y ya tienes 3/);
});

test("si bajan el plan por debajo de lo que tiene, no se borra nada: solo no puede crear más", () => {
  const c = calcularCupo({ creaComunidades: true, plan: { nombre: "Esencial", maxComunidades: 1 } }, 3);
  assert.equal(c.puede, false);
  assert.equal(c.restantes, 0);
  assert.match(c.motivo!, /Tu plan Esencial permite 1 comunidad y ya tienes 3/);
});

test("plan sin límite", () => {
  assert.equal(calcularCupo({ creaComunidades: true, plan: { nombre: "Ultra", maxComunidades: null } }, 500).puede, true);
});

test("la plataforma puede quitar la facultad aunque haya cupo", () => {
  const c = calcularCupo({ creaComunidades: false, plan: esencialPro }, 0);
  assert.equal(c.puede, false);
  assert.match(c.motivo!, /no tiene habilitada la creación/);
});

test("plan con cupo 0", () => {
  assert.equal(calcularCupo({ creaComunidades: true, plan: { nombre: "Prueba", maxComunidades: 0 } }, 0).puede, false);
});
