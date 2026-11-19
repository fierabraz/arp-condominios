import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { compararConAbono, decidirVerificacion, type AbonoLibre, type TransferenciaPendiente } from "./verificacion-automatica";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const t = (id: string, extra: Partial<TransferenciaPendiente> = {}): TransferenciaPendiente => ({
  id,
  unidadId: `u-${id}`,
  unidad: "101",
  fecha: d("2026-11-05"),
  monto: 50000,
  operacion: "123456789",
  ...extra,
});
const a = (id: string, extra: Partial<AbonoLibre> = {}): AbonoLibre => ({
  id,
  fecha: d("2026-11-05"),
  restante: 50000,
  descripcion: "TRANSF DE TERCERO",
  referencia: "OP 123456789",
  contraparte: null,
  ...extra,
});

describe("FIN-003.3 · comparar una transferencia con un abono", () => {
  test("monto, fecha y n° de operación iguales: coincidencia exacta", () => {
    assert.equal(compararConAbono(t("1"), a("A"))?.nivel, "EXACTA");
  });
  test("mismo monto con fecha a 1 o 2 días: parcial", () => {
    assert.equal(compararConAbono(t("1"), a("A", { fecha: d("2026-11-06") }))?.nivel, "PARCIAL");
    assert.equal(compararConAbono(t("1"), a("A", { fecha: d("2026-11-07") }))?.nivel, "PARCIAL");
  });
  test("mismo monto y fecha, pero el residente no informó n° de operación: parcial", () => {
    assert.equal(compararConAbono(t("1", { operacion: null }), a("A"))?.nivel, "PARCIAL");
  });
  test("la cartola no trae número de operación: parcial", () => {
    assert.equal(compararConAbono(t("1"), a("A", { referencia: null, descripcion: "ABONO" }))?.nivel, "PARCIAL");
  });
  test("mismo n° de operación con monto distinto: con diferencias", () => {
    assert.equal(compararConAbono(t("1"), a("A", { restante: 45000 }))?.nivel, "DIFERENCIA");
  });
  test("monto distinto, la glosa nombra la unidad y fecha cercana: con diferencias", () => {
    assert.equal(compararConAbono(t("1", { operacion: null }), a("A", { restante: 45000, referencia: null, descripcion: "GC 101 NOV" }))?.nivel, "DIFERENCIA");
  });
  test("monto distinto sin nada más en común: no tienen relación", () => {
    assert.equal(compararConAbono(t("1", { operacion: null }), a("A", { restante: 45000, referencia: null, descripcion: "ABONO" })), null);
  });
  test("más de 7 días de diferencia: no tienen relación", () => {
    assert.equal(compararConAbono(t("1"), a("A", { fecha: d("2026-11-20") })), null);
  });
  test("mismo monto, 2 días y otro n° de operación: no tienen relación", () => {
    assert.equal(compararConAbono(t("1"), a("A", { fecha: d("2026-11-07"), referencia: "OP 999999" })), null);
  });
  test("un abono ya conciliado no se considera", () => {
    assert.equal(compararConAbono(t("1"), a("A", { restante: 0 })), null);
  });
});

describe("FIN-003.3 · decidir qué hacer con cada transferencia", () => {
  test("una exacta e inequívoca queda verificada", () => {
    const r = decidirVerificacion([t("1")], [a("A"), a("B", { restante: 70000, referencia: null })]);
    assert.deepEqual(
      r.decisiones.map((x) => [x.transferenciaId, x.movimientoId, x.resultado]),
      [["1", "A", "VERIFICADA"]],
    );
    assert.deepEqual(r.abonosSinTransferencia, ["B"]);
  });
  test("dos abonos idénticos para la misma transferencia: nadie se verifica solo", () => {
    const r = decidirVerificacion([t("1")], [a("A"), a("B")]);
    assert.equal(r.decisiones.length, 1);
    assert.equal(r.decisiones[0].resultado, "POR_CONFIRMAR");
    assert.match(r.decisiones[0].motivos.join(" "), /más de un abono/);
  });
  test("un mismo abono nunca se usa para dos transferencias", () => {
    const r = decidirVerificacion([t("1", { operacion: null }), t("2", { operacion: null, unidad: "102" })], [a("A", { referencia: null })]);
    assert.equal(r.decisiones.length, 1);
    assert.equal(new Set(r.decisiones.map((x) => x.movimientoId)).size, r.decisiones.length);
  });
  test("cada transferencia toma su abono por número de operación", () => {
    const r = decidirVerificacion(
      [t("1", { operacion: "111111" }), t("2", { operacion: "222222", unidad: "102" })],
      [a("A", { referencia: "222222" }), a("B", { referencia: "111111" })],
    );
    const de = Object.fromEntries(r.decisiones.map((x) => [x.transferenciaId, [x.movimientoId, x.resultado]]));
    assert.deepEqual(de, { "1": ["B", "VERIFICADA"], "2": ["A", "VERIFICADA"] });
  });
  test("la exacta gana el abono aunque otra transferencia también se le parezca", () => {
    const r = decidirVerificacion([t("1"), t("2", { operacion: null, unidad: "102" })], [a("A")]);
    assert.deepEqual(
      r.decisiones.map((x) => [x.transferenciaId, x.resultado]),
      [["1", "VERIFICADA"]],
    );
  });
  test("sin coincidencias, la transferencia no aparece (sigue pendiente)", () => {
    const r = decidirVerificacion([t("1")], [a("A", { restante: 12345, referencia: null, descripcion: "OTRO" })]);
    assert.equal(r.decisiones.length, 0);
    assert.deepEqual(r.abonosSinTransferencia, ["A"]);
  });
  test("monto que no calza con n° de operación: con diferencias", () => {
    const r = decidirVerificacion([t("1")], [a("A", { restante: 40000 })]);
    assert.equal(r.decisiones[0].resultado, "CON_DIFERENCIAS");
  });
  test("el n° de operación pesa más que un abono parecido sin número", () => {
    // La 103 informó 105.000 con op. 889900; el banco abonó 100.000 con esa operación. Otro abono de
    // 105.000 sin número es de la 102 (un día después de lo que ella informó).
    const r = decidirVerificacion(
      [t("102", { unidad: "102", operacion: null, fecha: d("2026-11-17"), monto: 105000 }), t("103", { unidad: "103", operacion: "889900", fecha: d("2026-11-18"), monto: 105000 })],
      [a("SIN-OP", { fecha: d("2026-11-18"), restante: 105000, referencia: null, descripcion: "TRANSF" }), a("OP", { fecha: d("2026-11-18"), restante: 100000, referencia: "889900" })],
    );
    const de = Object.fromEntries(r.decisiones.map((x) => [x.transferenciaId, [x.movimientoId, x.resultado]]));
    assert.deepEqual(de, { "102": ["SIN-OP", "POR_CONFIRMAR"], "103": ["OP", "CON_DIFERENCIAS"] });
  });
});
