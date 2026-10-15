import { test } from "node:test";
import assert from "node:assert/strict";
import { aplicarPago, calcularAvisos, fechaVencimiento, repartir } from "./cobro";

test("repartir suma exactamente el total", () => {
  const r = repartir(1000, [33.3333, 33.3333, 33.3334]);
  assert.equal(r.reduce((a, b) => a + b, 0), 1000);
  assert.deepEqual(r, [333, 333, 334]);
});

test("repartir con total que no divide parejo", () => {
  const r = repartir(100, [1, 1, 1]);
  assert.deepEqual(r, [34, 33, 33]);
});

test("ejemplo del documento: 5.000.000 con alícuota 1,25 % y multa de 10.000", () => {
  const otras = Array.from({ length: 79 }, (_, i) => ({
    id: `u${i}`,
    alicuota: 98.75 / 79,
    cargosIndividuales: 0,
    deudaVencida: 0,
  }));
  const [linea] = calcularAvisos({
    totalGastosComunes: 5_000_000,
    porcentajeReserva: 5,
    tasaInteresMora: 0,
    unidades: [{ id: "a", alicuota: 1.25, cargosIndividuales: 10_000, deudaVencida: 0 }, ...otras],
  });
  assert.equal(linea.gastoComun, 62_500);
  assert.equal(linea.fondoReserva, 3_125);
  assert.equal(linea.cargos, 10_000);
  assert.equal(linea.total, 75_625);
});

test("los avisos suman el total de gastos más la reserva", () => {
  const unidades = [11, 11, 11, 11, 11, 11, 11, 11, 3, 3, 3, 3].map((a, i) => ({
    id: `${i}`,
    alicuota: a,
    cargosIndividuales: 0,
    deudaVencida: 0,
  }));
  const lineas = calcularAvisos({ totalGastosComunes: 1_234_567, porcentajeReserva: 5, tasaInteresMora: 0, unidades });
  assert.equal(lineas.reduce((s, l) => s + l.gastoComun, 0), 1_234_567);
  assert.equal(lineas.reduce((s, l) => s + l.fondoReserva, 0), Math.round(1_234_567 * 0.05));
});

test("interés por mora sobre la deuda vencida", () => {
  const [l] = calcularAvisos({
    totalGastosComunes: 100_000,
    porcentajeReserva: 0,
    tasaInteresMora: 1.5,
    unidades: [{ id: "a", alicuota: 100, cargosIndividuales: 0, deudaVencida: 200_000 }],
  });
  assert.equal(l.interes, 3_000);
  assert.equal(l.total, 103_000);
});

test("rechaza alícuotas que no suman 100", () => {
  assert.throws(() =>
    calcularAvisos({
      totalGastosComunes: 1000,
      porcentajeReserva: 0,
      tasaInteresMora: 0,
      unidades: [{ id: "a", alicuota: 60, cargosIndividuales: 0, deudaVencida: 0 }],
    }),
  );
});

test("un pago cubre primero la deuda más antigua y deja saldo a favor", () => {
  const r = aplicarPago(150, [
    { id: "ago", saldo: 100 },
    { id: "sep", saldo: 30 },
    { id: "oct", saldo: 100 },
  ]);
  assert.deepEqual(r.aplicaciones, [
    { avisoId: "ago", monto: 100 },
    { avisoId: "sep", monto: 30 },
    { avisoId: "oct", monto: 20 },
  ]);
  assert.equal(r.sobrante, 0);
  assert.equal(aplicarPago(50, [{ id: "a", saldo: 20 }]).sobrante, 30);
});

test("vencimiento cae en el mes siguiente, también en diciembre", () => {
  assert.equal(fechaVencimiento(2026, 10, 10).toISOString().slice(0, 10), "2026-11-10");
  assert.equal(fechaVencimiento(2026, 12, 5).toISOString().slice(0, 10), "2027-01-05");
});

test("lee montos escritos a la chilena", async () => {
  const { aMonto } = await import("./forms");
  assert.equal(aMonto("1.234.567"), 1234567);
  assert.equal(aMonto("$ 45.000"), 45000);
  assert.equal(aMonto("1234,5"), 1234.5);
  assert.equal(aMonto("1.234,50"), 1234.5);
  assert.equal(aMonto("1500.50"), 1500.5);
  assert.equal(aMonto(""), undefined);
});
