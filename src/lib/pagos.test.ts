import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buscarCoincidencias,
  cuentaPublicable,
  faltantesCuentaPago,
  formatoRut,
  referenciaSugerida,
  rutValido,
  tipoComprobante,
  volverPermitido,
} from "./pagos";

test("RUT: valida el dígito verificador y da formato", () => {
  assert.equal(rutValido("11.111.111-1"), true);
  assert.equal(rutValido("76.086.428-5"), true);
  assert.equal(rutValido("12.345.678-5"), true);
  assert.equal(rutValido("12.345.678-K"), false);
  assert.equal(rutValido("1-9"), false);
  assert.equal(formatoRut("760864285"), "76.086.428-5");
});

const cuenta = {
  banco: "Banco de Chile",
  tipo: "CORRIENTE",
  numeroFinal: "4321",
  numeroCuenta: "0012344321",
  titular: "Comunidad Ficticia",
  rutTitular: "760864285",
  correoPagos: null,
  recibePagos: true,
  verificadaEn: new Date(),
  activa: true,
};

test("datos para transferir: solo se publican completos, marcados y verificados", () => {
  assert.deepEqual(faltantesCuentaPago(cuenta), []);
  assert.equal(cuentaPublicable(cuenta), true);
  assert.equal(cuentaPublicable({ ...cuenta, verificadaEn: null }), false);
  assert.equal(cuentaPublicable({ ...cuenta, recibePagos: false }), false);
  assert.equal(cuentaPublicable({ ...cuenta, activa: false }), false);
  assert.equal(cuentaPublicable({ ...cuenta, titular: null }), false);
  assert.equal(cuentaPublicable({ ...cuenta, rutTitular: "760864284" }), false);
  // El número completo debe terminar en los 4 dígitos con que se identifican sus cartolas.
  assert.deepEqual(faltantesCuentaPago({ ...cuenta, numeroCuenta: "0012349999" }), ["número de cuenta que termine en 4321"]);
});

test("referencia sugerida: corta y sin datos personales", () => {
  assert.equal(referenciaSugerida("101", { anio: 2026, mes: 11 }), "GC 101 NOV-26");
  assert.equal(referenciaSugerida("Casa 4 B", { anio: 2027, mes: 1 }), "GC CASA4B ENE-27");
  assert.equal(referenciaSugerida("101", null), "GC 101");
});

test("volver después de ingresar: solo a un enlace de pago de Convive", () => {
  const codigo = "0123456789abcdef0123456789abcdef";
  assert.equal(volverPermitido(`/pagar/${codigo}`), `/pagar/${codigo}`);
  assert.equal(volverPermitido("https://otro.sitio/pagar/" + codigo), null);
  assert.equal(volverPermitido("//otro.sitio"), null);
  assert.equal(volverPermitido(`/pagar/${codigo}/../../condominios`), null);
  assert.equal(volverPermitido(null), null);
});

test("comprobante: reconoce el tipo por el contenido", () => {
  assert.equal(tipoComprobante(new TextEncoder().encode("%PDF-1.7 ...")), "application/pdf");
  assert.equal(tipoComprobante(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(tipoComprobante(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), "image/png");
  assert.equal(tipoComprobante(new TextEncoder().encode("<html><script>")), null);
});

const dia = (s: string) => new Date(`${s}T00:00:00Z`);
const mov = (id: string, fecha: string, monto: number, extra: Partial<{ montoConciliado: number; descripcion: string; referencia: string }> = {}) => ({
  id,
  fecha: dia(fecha),
  monto,
  montoConciliado: extra.montoConciliado ?? 0,
  descripcion: extra.descripcion ?? null,
  referencia: extra.referencia ?? null,
  contraparte: null,
});

test("coincidencias: una sola fuerte no es ambigua", () => {
  const r = buscarCoincidencias({ fecha: dia("2026-11-10"), monto: 85000, operacion: null }, [
    mov("a", "2026-11-10", 85000),
    mov("b", "2026-11-12", 40000),
    mov("c", "2026-11-30", 85000), // demasiado lejos
    mov("d", "2026-11-10", -85000), // cargo
  ]);
  assert.deepEqual(r.coincidencias.map((c) => c.id), ["a", "b"]);
  assert.equal(r.coincidencias[0].nivel, "fuerte");
  assert.equal(r.ambigua, false);
});

test("coincidencias: dos iguales quedan como ambiguas (decide una persona)", () => {
  const r = buscarCoincidencias({ fecha: dia("2026-11-10"), monto: 85000, operacion: null }, [
    mov("a", "2026-11-10", 85000),
    mov("b", "2026-11-10", 85000),
  ]);
  assert.equal(r.ambigua, true);
});

test("coincidencias: el número de operación desempata y lo ya conciliado no se ofrece", () => {
  const r = buscarCoincidencias({ fecha: dia("2026-11-10"), monto: 85000, operacion: "OP-778899" }, [
    mov("a", "2026-11-10", 85000),
    mov("b", "2026-11-11", 85000, { descripcion: "TRANSF 778899 JUAN" }),
    mov("c", "2026-11-10", 85000, { montoConciliado: 85000 }),
  ]);
  assert.equal(r.coincidencias[0].id, "b");
  assert.ok(!r.coincidencias.some((c) => c.id === "c"));
  // Un movimiento mayor (varias unidades en una transferencia) solo se ofrece por lo que le falta.
  const p = buscarCoincidencias({ fecha: dia("2026-11-10"), monto: 50000, operacion: null }, [mov("x", "2026-11-10", 120000, { montoConciliado: 60000 })]);
  assert.equal(p.coincidencias[0].restante, 60000);
});
