import { test } from "node:test";
import assert from "node:assert/strict";
import { claveVersion, codigoDocumento, diferenciaMontos, formatoFolio, ESTADO_CONSTANCIA } from "./constancias";

test("folio con formato fijo", () => {
  assert.equal(formatoFolio(42), "CP-000042");
});

test("solo cambios de estado, montos, obligaciones o motivo generan versión nueva", () => {
  const base = { estado: "INFORMADA" as const, montoConfirmado: null, aplicaciones: [], saldoAFavor: null, nota: null };
  assert.equal(claveVersion(base), claveVersion({ ...base }));
  assert.notEqual(claveVersion(base), claveVersion({ ...base, estado: "CONCILIADA" }));
  assert.notEqual(claveVersion(base), claveVersion({ ...base, nota: "motivo" }));
});

test("diferencia entre monto informado y confirmado", () => {
  assert.equal(diferenciaMontos({ montoInformado: 50000, montoConfirmado: null }), null);
  assert.equal(diferenciaMontos({ montoInformado: 50000, montoConfirmado: 50000 }), null);
  assert.equal(diferenciaMontos({ montoInformado: 50000, montoConfirmado: 45000 }), -5000);
});

test("código del documento legible y aviso de pendiente", () => {
  assert.equal(codigoDocumento("abcdef0123456789ffff"), "ABCD-EF01-2345-6789");
  assert.match(ESTADO_CONSTANCIA.INFORMADA.aviso, /NO acredita/);
});
