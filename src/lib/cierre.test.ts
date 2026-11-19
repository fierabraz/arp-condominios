import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { enMes, estadoMes, rangoMes, revisarCierre } from "./cierre";

const base = {
  emitido: true, yaCerrado: false, anterioresSinCerrar: [], movimientosSinConciliar: 0, movimientosDelMes: 3,
  transferenciasPendientes: 0, egresosPorPagar: 0, egresosSinRespaldo: 0, pagosSinCartola: 0,
};

describe("cierre del mes (reglas)", () => {
  test("tres estados del mes", () => {
    assert.equal(estadoMes({ estado: "ABIERTO", mesCerradoEn: null }), "ABIERTO");
    assert.equal(estadoMes({ estado: "CERRADO", mesCerradoEn: null }), "EMITIDO");
    assert.equal(estadoMes({ estado: "CERRADO", mesCerradoEn: new Date() }), "CERRADO");
  });
  test("rango del mes incluye el último día completo y febrero bisiesto", () => {
    const { desde, hasta } = rangoMes(2028, 2);
    assert.equal(desde.toISOString(), "2028-02-01T00:00:00.000Z");
    assert.equal(hasta.toISOString(), "2028-02-29T23:59:59.999Z");
    assert.ok(enMes(new Date("2026-10-31T23:00:00Z"), 2026, 10));
    assert.ok(!enMes(new Date("2026-11-01T00:00:00Z"), 2026, 10));
  });
  test("todo en orden: sin bloqueos ni advertencias", () => {
    assert.deepEqual(revisarCierre(base), { bloqueos: [], advertencias: [] });
  });
  test("bloquean: sin emitir, ya cerrado, meses anteriores abiertos y cartola sin conciliar", () => {
    const r = revisarCierre({ ...base, emitido: false, yaCerrado: true, anterioresSinCerrar: ["Septiembre 2026"], movimientosSinConciliar: 2 });
    assert.equal(r.bloqueos.length, 4);
  });
  test("solo advierten: sin cartola, transferencias por verificar, egresos por pagar o sin respaldo, pagos sin cartola", () => {
    const r = revisarCierre({ ...base, movimientosDelMes: 0, transferenciasPendientes: 1, egresosPorPagar: 1, egresosSinRespaldo: 1, pagosSinCartola: 1 });
    assert.equal(r.bloqueos.length, 0);
    assert.equal(r.advertencias.length, 5);
    assert.ok(r.advertencias.some((a) => /No cuentan como pagadas/.test(a)));
  });
});
