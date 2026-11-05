import { test } from "node:test";
import assert from "node:assert/strict";
import { estadoAlicuotas } from "./alicuotas";

test("con el total conocido y faltando unidades, muestra avance y no error", () => {
  const e = estadoAlicuotas({ cargadas: 2, suma: 2.5, total: 100 });
  assert.equal(e.tipo, "progreso");
  assert.equal(e.faltan, 98);
  assert.match(e.texto, /2 de 100/);
});

test("sin total, pide indicarlo en vez de dar error", () => {
  assert.equal(estadoAlicuotas({ cargadas: 2, suma: 2.5 }).tipo, "revisar");
});

test("con todas las unidades cargadas y suma distinta de 100, es error", () => {
  assert.equal(estadoAlicuotas({ cargadas: 100, suma: 99, total: 100 }).tipo, "error");
});

test("si la suma pasa de 100 es error aunque falten unidades", () => {
  assert.equal(estadoAlicuotas({ cargadas: 3, suma: 120, total: 100 }).tipo, "error");
});

test("si cuadra con todas, ok", () => {
  assert.equal(estadoAlicuotas({ cargadas: 100, suma: 100, total: 100 }).tipo, "ok");
  assert.equal(estadoAlicuotas({ cargadas: 4, suma: 100 }).tipo, "ok");
});

test("si ya suma 100 pero faltan unidades, avisa", () => {
  assert.equal(estadoAlicuotas({ cargadas: 50, suma: 100, total: 100 }).tipo, "error");
});
