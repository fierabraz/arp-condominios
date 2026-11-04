import { test } from "node:test";
import assert from "node:assert/strict";
import { actividadReciente, construirAlertas, type CuentaUnidad } from "./alertas-residente";

const ahora = new Date("2026-11-04T12:00:00Z");
const dias = (n: number) => new Date(ahora.getTime() + n * 86_400_000);
const base = {
  votaciones: [],
  publicaciones: [],
  ahora,
  moneda: (n: number) => `$${n}`,
  fecha: (d: Date) => d.toISOString().slice(0, 10),
};
const cuenta = (c: Partial<CuentaUnidad>): CuentaUnidad => ({
  unidadId: "u1",
  nombre: "Depto 101",
  deuda: 0,
  vencida: 0,
  proximoVencimiento: null,
  ...c,
});

test("sin deuda, votaciones ni avisos no hay alertas", () => {
  assert.deepEqual(construirAlertas({ ...base, cuentas: [cuenta({})] }), []);
});

test("la deuda vencida es urgente", () => {
  const [a] = construirAlertas({ ...base, cuentas: [cuenta({ deuda: 100, vencida: 100 })] });
  assert.equal(a.nivel, "urgente");
  assert.match(a.detalle, /\$100/);
});

test("lo que vence en 7 días es importante; más allá no aparece", () => {
  const pronto = construirAlertas({ ...base, cuentas: [cuenta({ deuda: 50, proximoVencimiento: dias(3) })] });
  assert.equal(pronto[0].nivel, "importante");
  const lejos = construirAlertas({ ...base, cuentas: [cuenta({ deuda: 50, proximoVencimiento: dias(20) })] });
  assert.equal(lejos.length, 0);
});

test("con deuda vencida y otra por vencer muestra ambas, la urgente primero", () => {
  const r = construirAlertas({
    ...base,
    votaciones: [{ id: "v", titulo: "Pintura", cierraEn: dias(2) }],
    cuentas: [cuenta({ deuda: 150, vencida: 100, proximoVencimiento: dias(2) })],
  });
  assert.deepEqual(
    r.map((a) => a.nivel),
    ["urgente", "importante", "importante"],
  );
  assert.match(r[1].detalle, /\$50/);
});

test("solo los avisos de los últimos 7 días son informativos", () => {
  const r = construirAlertas({
    ...base,
    cuentas: [],
    publicaciones: [
      { id: "a", titulo: "Corte de agua", creadoEn: dias(-1) },
      { id: "b", titulo: "Viejo", creadoEn: dias(-30) },
    ],
  });
  assert.deepEqual(
    r.map((a) => [a.nivel, a.detalle]),
    [["informativo", "Corte de agua"]],
  );
});

test("con varias unidades el título dice cuál", () => {
  const r = construirAlertas({
    ...base,
    cuentas: [cuenta({ deuda: 1, vencida: 1 }), cuenta({ unidadId: "u2", nombre: "Bodega 3", deuda: 2, vencida: 2 })],
  });
  assert.deepEqual(
    r.map((a) => a.titulo),
    ["Deuda vencida (Depto 101)", "Deuda vencida (Bodega 3)"],
  );
});

test("los enlaces conservan la unidad elegida", () => {
  const [a] = construirAlertas({
    ...base,
    cuentas: [cuenta({ deuda: 1, vencida: 1 })],
    enlace: (h) => `${h}?unidad=u1`,
  });
  assert.equal(a.href, "/mi-cuenta/pagos?unidad=u1");
});

test("la actividad va de lo más nuevo a lo más antiguo y omite fechas futuras", () => {
  const ev = (id: string, d: number) => ({ id, tipo: "pago" as const, texto: id, fecha: dias(d), href: "/" });
  const r = actividadReciente([ev("a", -3), ev("futuro", 2), ev("b", -1), ev("c", -2)], ahora, 2);
  assert.deepEqual(
    r.map((e) => e.id),
    ["b", "c"],
  );
});
