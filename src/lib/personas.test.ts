import { test } from "node:test";
import assert from "node:assert/strict";
import { motivosParaNoEliminar } from "./personas";

test("SEG-20: sin unidades, vínculos ni cuenta se puede eliminar", () => {
  assert.deepEqual(motivosParaNoEliminar({ unidades: 0, vinculos: 0, tieneCuenta: false }), []);
});

test("SEG-20: con vínculos, unidad o cuenta no se elimina y se explica qué hacer", () => {
  assert.match(motivosParaNoEliminar({ unidades: 1, vinculos: 1, tieneCuenta: false }).join(" "), /termina el vínculo/);
  assert.match(motivosParaNoEliminar({ unidades: 2, vinculos: 0, tieneCuenta: false }).join(" "), /2 unidades/);
  assert.match(motivosParaNoEliminar({ unidades: 0, vinculos: 0, tieneCuenta: true }).join(" "), /cuenta/);
  assert.equal(motivosParaNoEliminar({ unidades: 1, vinculos: 3, tieneCuenta: true }).length, 2);
});
