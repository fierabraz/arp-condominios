import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluarAlDia, formatoFolioCertificado } from "./certificados";

const ahora = new Date("2026-11-18T12:00:00Z");
const d = (s: string) => new Date(`${s}T12:00:00Z`);

test("sin avisos emitidos no se certifica", () => {
  assert.equal(evaluarAlDia([], ahora).alDia, false);
});

test("al día con un aviso por vencer: no es saldo cero", () => {
  const r = evaluarAlDia([{ saldo: 0, vencimiento: d("2026-10-10") }, { saldo: 105000, vencimiento: d("2026-11-25") }], ahora);
  assert.equal(r.alDia, true);
  if (r.alDia) {
    assert.equal(r.porVencer, 105000);
    assert.equal(r.proximoVencimiento?.toISOString().slice(0, 10), "2026-11-25");
  }
});

test("con deuda vencida no se certifica, y avisa si hay pagos por verificar", () => {
  const r = evaluarAlDia([{ saldo: 5000, vencimiento: d("2026-10-10") }], ahora, 1);
  assert.equal(r.alDia, false);
  if (!r.alDia) {
    assert.equal(r.vencida, 5000);
    assert.match(r.motivo, /pendientes de verificación/);
  }
});

test("folio del certificado", () => {
  assert.equal(formatoFolioCertificado(7), "CAD-000007");
});
