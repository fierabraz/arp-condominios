import { test } from "node:test";
import assert from "node:assert/strict";
import { leerDeudas, leerMonto, leerPeriodo, resumenApertura, revisarApertura, revisarDeuda, revisarFechaCorte, tramoDe, type DatosApertura } from "./apertura";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const corte = d("2026-11-30");

test("montos en pesos y períodos en varios formatos", () => {
  assert.equal(leerMonto("$65.000"), 65000);
  assert.equal(leerMonto("72000"), 72000);
  assert.equal(leerMonto("75.000,00"), 75000);
  assert.equal(leerMonto(80000), 80000);
  assert.equal(leerMonto("65.000,50"), null);
  assert.equal(leerMonto("1.5"), null);
  assert.equal(leerMonto("mucho"), null);
  assert.equal(leerPeriodo("09-2026"), "2026-09");
  assert.equal(leerPeriodo("2026-9"), "2026-09");
  assert.equal(leerPeriodo("Septiembre 2026"), "2026-09");
  assert.equal(leerPeriodo("sep-2026"), "2026-09");
  assert.equal(leerPeriodo("15-10-2026"), "2026-10");
  assert.equal(leerPeriodo("13-2026"), null);
  assert.equal(leerPeriodo("ayer"), null);
});

test("fecha de corte razonable", () => {
  assert.equal(revisarFechaCorte(corte, d("2026-11-06")), null);
  assert.match(revisarFechaCorte(d("2028-01-01"), d("2026-11-06"))!, /más de un año/);
  assert.match(revisarFechaCorte(d("1999-12-31"), d("2026-11-06"))!, /antigua/);
});

test("una deuda de apertura: saldo positivo, antes del corte, desglosada y que cuadre", () => {
  const ok = { periodo: "2026-09", concepto: "Gasto común", saldo: 65000 };
  assert.equal(revisarDeuda(ok, corte), null);
  assert.equal(revisarDeuda({ ...ok, montoOriginal: 80000, abonos: 15000 }, corte), null);
  assert.match(revisarDeuda({ ...ok, saldo: 0 }, corte)!, /mayor que 0/);
  assert.match(revisarDeuda({ ...ok, periodo: "2026-12" }, corte)!, /posterior a la fecha de corte/);
  assert.match(revisarDeuda({ ...ok, concepto: "Saldo anterior" }, corte)!, /total o saldo arrastrado/);
  assert.match(revisarDeuda({ ...ok, montoOriginal: 80000, abonos: 10000 }, corte)!, /No cuadra/);
  assert.match(revisarDeuda({ ...ok, montoOriginal: 50000 }, corte)!, /mayor que el monto original/);
});

test("antigüedad a la fecha de corte", () => {
  assert.equal(tramoDe({ periodo: "2026-11", vencimiento: d("2026-12-05") }, corte), "por vencer");
  assert.equal(tramoDe({ periodo: "2026-11" }, corte), "0-30");
  assert.equal(tramoDe({ periodo: "2026-09", vencimiento: d("2026-09-05") }, corte), "31-90");
  assert.equal(tramoDe({ periodo: "2026-01" }, corte), "más de 180");
});

test("caso A-305: tres deudas desglosadas suman 212.000 y una fila de total se rechaza", () => {
  const hoja = [
    ["Deudas a la fecha de corte"],
    ["Unidad", "Período", "Concepto", "Monto original", "Abonos", "Saldo pendiente", "Vencimiento", "Estado"],
    ["A-305", "09-2026", "Gasto común", 65000, 0, 65000, "05-09-2026", ""],
    ["A-305", "octubre 2026", "", "$72.000", "", "72.000", "", "Confirmada"],
    ["A-305", "11-2026", "Gasto común", "", "", 75000, "", "Discutida"],
    ["A-305", "11-2026", "Total", "", "", 212000, "", ""],
    ["Total", "", "", "", "", 212000, "", ""],
    ["B-101", "12-2026", "", "", "", 1000, "", ""],
    ["B-102", "10-2026", "", "", "", "-5", "", "Rara"],
  ];
  const r = leerDeudas(hoja, corte, "Deudas");
  assert.equal(r.filas.length, 3);
  assert.equal(r.filas.reduce((s, f) => s + f.saldo, 0), 212000);
  assert.equal(r.filas[1].concepto, "Gasto común");
  assert.equal(r.filas[2].estado, "DISCUTIDA");
  assert.equal(r.errores.length, 4);
  assert.match(r.errores[0].mensaje, /total o saldo arrastrado/);
  assert.match(r.errores[1].mensaje, /fila de totales \(columna A, "Unidad"\)/);
  assert.match(r.errores[2].mensaje, /posterior a la fecha de corte/);
  assert.match(r.errores[3].mensaje, /estado "Rara" \(columna H, "Estado"\)/);
  assert.equal(r.errores[3].fila, 9);
  assert.equal(r.errores[3].hoja, "Deudas");
});

test("resumen: morosidad sin discutidas, antigüedad, fondos y cuadre bancario", () => {
  const datos: DatosApertura = {
    fechaCorte: corte,
    deudas: [
      { unidadId: "u1", periodo: "2026-09", concepto: "Gasto común", saldo: 65000, estado: "CONFIRMADA", vencimiento: d("2026-09-05") },
      { unidadId: "u1", periodo: "2026-10", concepto: "Gasto común", saldo: 72000, estado: "CONFIRMADA" },
      { unidadId: "u1", periodo: "2026-11", concepto: "Gasto común", saldo: 75000, estado: "DISCUTIDA" },
      { unidadId: "u2", periodo: "2026-11", concepto: "Multa", saldo: 10000, estado: "EN_CONVENIO" },
    ],
    creditos: [{ unidadId: "u3", monto: 20000 }, { unidadId: null, monto: 5000 }],
    fondos: [
      { tipo: "ORDINARIO", saldoContable: 1_000_000, pendienteRecaudar: 300_000 },
      { tipo: "RESERVA", saldoContable: 500_000, pendienteRecaudar: null },
    ],
    cuentas: [{ saldoCartola: 1_600_000, chequesNoCobrados: 120_000, depositosNoAbonados: 20_500 }],
    obligaciones: [{ monto: 90000, fondo: null }],
  };
  const r = resumenApertura(datos);
  assert.equal(r.deudas.total, 222000);
  assert.equal(r.deudas.cobrable, 147000);
  assert.equal(r.deudas.unidades, 2);
  assert.equal(r.deudas.porTramo["31-90"], 65000);
  assert.equal(r.deudas.porTramo["0-30"], 82000);
  assert.deepEqual(r.creditos, { aFavor: 20000, porIdentificar: 5000 });
  assert.equal(r.fondos.pendiente, 300_000);
  assert.equal(r.bancos.ajustado, 1_500_500);
  assert.deepEqual(r.cuadre, { diferencia: 500, nivel: "menor" });
  const rev = revisarApertura(datos, r);
  assert.equal(rev.ok, true);
  assert.ok(rev.advertencias.some((a) => /diferencia de 500/.test(a)));
  assert.ok(rev.advertencias.some((a) => /sin fondo/.test(a)));
  const vacia = revisarApertura({ ...datos, cuentas: [], fondos: [] }, r);
  assert.equal(vacia.ok, false);
  assert.equal(vacia.bloqueos.length, 2);
});
