import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { DistribucionInvalida, estadoSegunConciliado, nombraUnidad, proponerDistribucion, sugerirParaAbono, validarDistribucion } from "./conciliacion";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const avisos = [
  { id: "nov", saldo: 100, vencimiento: d("2026-12-10") },
  { id: "oct", saldo: 80, vencimiento: d("2026-11-10") },
];

describe("FIN-COMP A · distribución del pago", () => {
  test("la propuesta por defecto paga primero lo más antiguo", () => {
    assert.deepEqual(proponerDistribucion(120, avisos), { lineas: [{ avisoId: "oct", monto: 80 }, { avisoId: "nov", monto: 40 }], aFavor: 0 });
    assert.equal(proponerDistribucion(300, avisos).aFavor, 120);
  });
  test("la distribución elegida se respeta y lo que sobra queda a favor", () => {
    assert.deepEqual(validarDistribucion(150, [{ avisoId: "nov", monto: 100 }], avisos), { lineas: [{ avisoId: "nov", monto: 100 }], aFavor: 50 });
  });
  test("no se aplica más que el saldo, ni más que el pago, ni a avisos ajenos", () => {
    assert.throws(() => validarDistribucion(500, [{ avisoId: "oct", monto: 81 }], avisos), DistribucionInvalida);
    assert.throws(() => validarDistribucion(50, [{ avisoId: "oct", monto: 60 }], avisos), DistribucionInvalida);
    assert.throws(() => validarDistribucion(50, [{ avisoId: "otro", monto: 10 }], avisos), DistribucionInvalida);
    assert.throws(() => validarDistribucion(500, [{ avisoId: "oct", monto: 50 }, { avisoId: "oct", monto: 50 }], avisos), DistribucionInvalida);
  });
});

describe("FIN-COMP A · sugerencias para un abono", () => {
  const abono = { fecha: d("2026-11-05"), restante: 50000, descripcion: "TRANSF GC 101 NOV-26", referencia: null, contraparte: null, rutContraparte: null };
  test("reconoce el número de unidad en la glosa", () => {
    assert.equal(nombraUnidad("TRANSF GC 101 NOV-26", "101"), true);
    assert.equal(nombraUnidad("TRANSF 1010", "101"), false);
    assert.equal(nombraUnidad("depto 12-B", "12-B"), true);
  });
  test("una transferencia informada igual es una sugerencia fuerte y no ambigua", () => {
    const r = sugerirParaAbono(abono, {
      transferencias: [{ id: "t1", unidadId: "u1", unidad: "101", fecha: d("2026-11-05"), monto: 50000, operacion: null, pagadoPor: null }],
      pagos: [],
      unidades: [],
    });
    assert.equal(r.sugerencias[0].id, "t1");
    assert.equal(r.ambigua, false);
  });
  test("dos coincidencias fuertes = ambigua; fechas lejanas no se sugieren", () => {
    const t = (id: string, unidad: string, fecha = "2026-11-05") => ({ id, unidadId: id, unidad, fecha: d(fecha), monto: 50000, operacion: null, pagadoPor: null });
    const r = sugerirParaAbono({ ...abono, descripcion: null }, { transferencias: [t("a", "201"), t("b", "202"), t("c", "203", "2026-12-30")], pagos: [], unidades: [] });
    assert.equal(r.ambigua, true);
    assert.deepEqual(r.sugerencias.map((s) => s.id).sort(), ["a", "b"]);
  });
  test("estado del movimiento según lo conciliado", () => {
    assert.equal(estadoSegunConciliado(100, 0), "PENDIENTE");
    assert.equal(estadoSegunConciliado(100, 40), "REVISAR");
    assert.equal(estadoSegunConciliado(100, 100), "CONCILIADO");
  });
});

describe("FIN-COMP A · sugerencias sin ruido", () => {
  test("si todas las unidades deben lo mismo, no se sugieren por monto solo", () => {
    const u = (n: string) => ({ id: n, numero: n, deuda: 105000, saldosAvisos: [105000], ruts: [], nombres: [] });
    const abono = { fecha: d("2026-11-05"), restante: 105000, descripcion: "TRANSF X", referencia: null, contraparte: null, rutContraparte: null };
    const r = sugerirParaAbono(abono, { transferencias: [], pagos: [], unidades: ["101", "102", "103", "104"].map(u) });
    assert.equal(r.sugerencias.length, 0);
    const r2 = sugerirParaAbono({ ...abono, descripcion: "TRANSF GC 102" }, { transferencias: [], pagos: [], unidades: ["101", "102", "103", "104"].map(u) });
    assert.deepEqual(r2.sugerencias.map((s) => s.unidad), ["102"]);
    assert.equal(r2.ambigua, false);
  });
});
