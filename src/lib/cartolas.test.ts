// FIN-003.1 · Pruebas del interpretador de cartolas y de la detección de duplicados (sin base de datos).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  campoDe,
  comprobarSaldos,
  leerFechaCartola,
  leerHojaCartola,
  leerMonto,
  revisarMapeoCartola,
  separadorDe,
  formatoFechaDe,
} from "./cartolas";
import { clasificar, conHuellas, parecido, type MovimientoGuardado } from "./cartolas-duplicados";
import { leerCsv } from "./importacion";

test("reconoce los nombres de columna habituales de los bancos chilenos", () => {
  assert.equal(campoDe("Fecha"), "fecha");
  assert.equal(campoDe("Fecha transacción"), "fecha");
  assert.equal(campoDe("Detalle movimiento"), "descripcion");
  assert.equal(campoDe("Glosa"), "descripcion");
  assert.equal(campoDe("N° Documento"), "referencia");
  assert.equal(campoDe("Número de operación"), "referencia");
  assert.equal(campoDe("Cheques y otros cargos"), "cargo");
  assert.equal(campoDe("Giros"), "cargo");
  assert.equal(campoDe("Depósitos y otros abonos"), "abono");
  assert.equal(campoDe("Abonos ($)"), "abono");
  assert.equal(campoDe("Monto"), "monto");
  assert.equal(campoDe("Saldo disponible"), "saldo");
  assert.equal(campoDe("Saldo Diario"), "saldo");
  assert.equal(campoDe("RUT Origen"), "rutContraparte");
  assert.equal(campoDe("Nombre Origen"), "contraparte");
  assert.equal(campoDe("Sucursal"), "otro");
  assert.equal(campoDe("F. Contable"), undefined);
  assert.equal(campoDe("Nro. Op."), undefined);
});

test("montos: punto de miles chileno, coma decimal, signos y paréntesis", () => {
  assert.equal(leerMonto("1.234.567", "COMA"), 1234567);
  assert.equal(leerMonto("$ 85.000", "COMA"), 85000);
  assert.equal(leerMonto("-85.000", "COMA"), -85000);
  assert.equal(leerMonto("85.000-", "COMA"), -85000);
  assert.equal(leerMonto("(1.500)", "COMA"), -1500);
  assert.equal(leerMonto("1.234,56", "COMA"), 1234.56);
  assert.equal(leerMonto("1,234.56", "PUNTO"), 1234.56);
  assert.equal(leerMonto("1234.5", "PUNTO"), 1234.5);
  assert.equal(leerMonto(92500, "COMA"), 92500);
  // Nunca se adivina: un texto que no calza con el separador elegido no es un monto.
  assert.equal(leerMonto("1.234.5", "COMA"), null);
  assert.equal(leerMonto("12,34,5", "PUNTO"), null);
  assert.equal(leerMonto("abc", "COMA"), null);
  assert.equal(leerMonto("", "COMA"), null);
});

test("separador decimal de una columna: decide con los valores que no dejan dudas", () => {
  assert.deepEqual(separadorDe(["1.234.567", "85.000"]), { separador: "COMA", seguro: true, dudosos: 1 });
  assert.equal(separadorDe(["1,234,567.00", "85,000.00"]).separador, "PUNTO");
  assert.equal(separadorDe(["1.234,5"]).separador, "COMA");
  // Solo "85.000": la costumbre chilena (punto de miles), sin certeza.
  assert.deepEqual(separadorDe(["85.000", "92.500"]), { separador: "COMA", seguro: false, dudosos: 2 });
  assert.equal(leerMonto("85.000", separadorDe(["85.000"]).separador), 85000);
});

test("fechas: Excel, día-mes-año, mes en palabras, año corto; sin año o inválida = null", () => {
  assert.equal(leerFechaCartola("2026-10-05"), "2026-10-05");
  assert.equal(leerFechaCartola("05/10/2026"), "2026-10-05");
  assert.equal(leerFechaCartola("05-10-26"), "2026-10-05");
  assert.equal(leerFechaCartola("05.10.2026 14:32"), "2026-10-05");
  assert.equal(leerFechaCartola("01-oct-2026"), "2026-10-01");
  assert.equal(leerFechaCartola("1 de octubre de 2026"), "2026-10-01");
  assert.equal(leerFechaCartola("10/05/2026", "MDA"), "2026-10-05");
  assert.equal(leerFechaCartola(46300), "2026-10-05");
  assert.equal(leerFechaCartola("05/10"), null);
  assert.equal(leerFechaCartola("31/02/2026"), null);
  assert.equal(leerFechaCartola("hola"), null);
  assert.deepEqual(formatoFechaDe(["10/25/2026", "11/02/2026"]), { formato: "MDA", seguro: true, conflicto: false });
  assert.deepEqual(formatoFechaDe(["25/10/2026"]), { formato: "DMA", seguro: true, conflicto: false });
  assert.equal(formatoFechaDe(["05/10/2026"]).seguro, false);
});

const HOJA_A = [
  ["Banco Ficticio — Cartola cuenta corriente"],
  ["Cuenta N° ****4521"],
  [],
  ["Fecha", "N° Documento", "Descripción", "Cargos", "Abonos", "Saldo"],
  ["01/10/2026", null, "Saldo inicial", null, null, "1.000.000"],
  ["01/10/2026", "7001", "TRANSF DE ANA", null, "85.000", "1.085.000"],
  ["02/10/2026", "5512", "PAGO ASEO", "420.000", null, "665.000"],
  ["03/10/2026", null, "COMISION", "8.900", null, "656.100"],
  ["Fecha", "N° Documento", "Descripción", "Cargos", "Abonos", "Saldo"],
  ["04/10/2026", "7002", "TRANSF DE LUIS", null, "1.234,50", "657.334,50"],
  [null, null, "Total cargos", "428.900", null, null],
];

test("lee una cartola con encabezado del banco, saldo inicial, títulos repetidos y totales", () => {
  const l = leerHojaCartola("Movimientos", HOJA_A, { hoy: "2026-11-11" });
  assert.equal(l.sinTitulos, false);
  assert.deepEqual(
    l.movimientos.map((m) => [m.fila, m.fecha, m.monto, m.referencia, m.saldo]),
    [
      [6, "2026-10-01", 85000, "7001", 1085000],
      [7, "2026-10-02", -420000, "5512", 665000],
      [8, "2026-10-03", -8900, undefined, 656100],
      [10, "2026-10-04", 1234.5, "7002", 657334.5],
    ],
  );
  assert.deepEqual(l.errores, []);
  assert.deepEqual(l.omitidas, [5, 9, 11]);
  assert.deepEqual(l.saldo, { revisados: 3, descuadres: [] });
  assert.equal(l.usados.decimal, "COMA");
});

test("una sola columna de monto con signo, y el signo invertido de algunos bancos", () => {
  const hoja = [
    ["Fecha", "Glosa", "Monto"],
    ["01-10-2026", "Abono", "85.000"],
    ["02-10-2026", "Cargo", "-420.000"],
  ];
  assert.deepEqual(leerHojaCartola("H", hoja).movimientos.map((m) => m.monto), [85000, -420000]);
  const invertido = leerHojaCartola("H", hoja, { formatos: { fecha: "AUTO", decimal: "AUTO", signo: "POSITIVO_CARGO" } });
  assert.deepEqual(invertido.movimientos.map((m) => m.monto), [-85000, 420000]);
});

test("las filas dudosas quedan como error con su fila y columna; nada se inventa", () => {
  const hoja = [
    ["Fecha", "Descripción", "Cargos", "Abonos"],
    ["01/10/2026", "Sin monto", null, null],
    ["15/10", "Sin año", null, "10.000"],
    ["02/10/2026", "Cargo y abono", "1.000", "2.000"],
    ["03/10/2026", "Monto raro", "12,34,56", null],
    [null, "Monto sin fecha", "5.000", null],
    ["2026-12-31", "Futura", null, "1.000"],
    ["04/10/2026", "Buena", null, "1.000"],
  ];
  const l = leerHojaCartola("Hoja1", hoja, { hoy: "2026-11-11" });
  assert.deepEqual(l.movimientos.map((m) => m.descripcion), ["Buena"]);
  assert.deepEqual(l.errores.map((e) => e.fila), [2, 3, 4, 5, 6, 7]);
  assert.match(l.errores[0].mensaje, /no tiene cargo ni abono/i);
  assert.match(l.errores[1].mensaje, /no tiene año/i);
  assert.match(l.errores[2].mensaje, /cargo y abono a la vez/i);
  assert.match(l.errores[3].mensaje, /no entiendo el monto «12,34,56» \(columna C, «Cargos»\)/i);
  assert.match(l.errores[4].mensaje, /falta la fecha/i);
  assert.match(l.errores[5].mensaje, /futura/i);
  assert.equal(l.errores[0].hoja, "Hoja1");
});

test("sin títulos reconocibles pide asignar columnas; con la asignación se lee", () => {
  const hoja = [
    ["Banco X"],
    ["F. Contable", "Detalle", "Nro. Op.", "Débito", "Crédito"],
    ["01-oct-2026", "TRANSF", "11", "", "85.000"],
  ];
  const sin = leerHojaCartola("H", hoja);
  assert.equal(sin.sinTitulos, true);
  assert.deepEqual(sin.columnas.map((c) => c.titulo), ["F. Contable", "Detalle", "Nro. Op.", "Débito", "Crédito"]);
  assert.deepEqual(sin.columnas[0].ejemplos, ["01-oct-2026"]);
  const mapeo = { fcontable: "fecha", nroop: "referencia" } as const;
  const con = leerHojaCartola("H", hoja, { mapeo });
  assert.deepEqual(con.movimientos.map((m) => [m.fecha, m.referencia, m.monto]), [["2026-10-01", "11", 85000]]);
  assert.equal(revisarMapeoCartola({ fcontable: "fecha" }), "Indica qué columna tiene los montos (cargos y abonos, o una columna de monto).");
  assert.match(revisarMapeoCartola({ a: "fecha", b: "monto", c: "cargo" })!, /no las dos cosas/);
  assert.match(revisarMapeoCartola({ a: "fecha", b: "monto", c: "fecha" })!, /dos columnas/);
  assert.equal(revisarMapeoCartola({ a: "fecha", b: "monto", c: "otro", d: "otro" }), null);
});

test("comprobación de saldos: con saldo solo al final del día y en orden inverso", () => {
  const dia = [
    { fila: 1, monto: 100, saldo: undefined },
    { fila: 2, monto: 50, saldo: 1150 },
    { fila: 3, monto: -200, saldo: 950 },
    { fila: 4, monto: 10, saldo: 960 },
  ];
  assert.deepEqual(comprobarSaldos(dia), { revisados: 2, descuadres: [] });
  assert.deepEqual(comprobarSaldos([...dia].reverse().filter((m) => m.saldo !== undefined)), { revisados: 2, descuadres: [] });
  assert.deepEqual(comprobarSaldos([...dia.slice(0, 3), { fila: 4, monto: 10, saldo: 999 }])?.descuadres, [4]);
});

test("CSV con un título arriba: el separador sale de la fila de columnas", () => {
  const filas = leerCsv("Banco X, movimientos de octubre\r\n\r\nFecha;Glosa;Cargo;Abono\r\n01-10-2026;\"Pago; luz\";1.000;\r\n");
  assert.deepEqual(filas[2], ["Fecha", "Glosa", "Cargo", "Abono"]);
  assert.deepEqual(filas[3], ["01-10-2026", "Pago; luz", "1.000", ""]);
});

// ---------------------------------------------------------------------------
// Duplicados

const mov = (fila: number, fecha: string, monto: number, extra: { referencia?: string; descripcion?: string; saldo?: number } = {}) => ({
  hoja: "H",
  fila,
  fecha,
  monto,
  ...extra,
});
const guardado = (huella: string, fecha: string, monto: number, extra: Partial<MovimientoGuardado> = {}): MovimientoGuardado => ({
  id: huella,
  huella,
  fecha,
  monto,
  referencia: null,
  descripcion: null,
  saldo: null,
  importado: "2026-11-01T12:00:00Z",
  ...extra,
});

test("huellas: el mismo archivo da las mismas huellas y dos operaciones idénticas no se funden", () => {
  const a = conHuellas([mov(1, "2026-10-01", 85000, { descripcion: "TRANSF" }), mov(2, "2026-10-01", 85000, { descripcion: "TRANSF" })]);
  const b = conHuellas([mov(5, "2026-10-01", 85000, { descripcion: "TRANSF" }), mov(6, "2026-10-01", 85000, { descripcion: "TRANSF" })]);
  assert.notEqual(a[0].huella, a[1].huella);
  assert.deepEqual(a.map((m) => m.huella), b.map((m) => m.huella));
  // Con referencia, la descripción no influye (otro formato del mismo banco).
  const [x] = conHuellas([mov(1, "2026-10-01", 100, { referencia: "000123", descripcion: "A" })]);
  const [y] = conHuellas([mov(9, "2026-10-01", 100, { referencia: "123", descripcion: "B" })]);
  assert.equal(x.huella, y.huella);
});

test("clasificar: ya registrado por huella, por referencia y por saldo", () => {
  const [h] = conHuellas([mov(1, "2026-10-01", 85000, { descripcion: "TRANSF DE ANA" })]);
  const filas = clasificar(
    conHuellas([
      mov(1, "2026-10-01", 85000, { descripcion: "TRANSF DE ANA" }),
      mov(2, "2026-10-02", -420000, { referencia: "5512", descripcion: "PAGO ASEO (otro formato)" }),
      mov(3, "2026-10-03", -8900, { descripcion: "COMISION MANT.", saldo: 656100 }),
    ]),
    [
      guardado(h.huella, "2026-10-01", 85000),
      guardado("g2", "2026-10-02", -420000, { referencia: "5512", descripcion: "PAGO ASEO" }),
      guardado("g3", "2026-10-03", -8900, { descripcion: "COMISION MANTENCION", saldo: 656100 }),
    ],
  );
  assert.deepEqual(filas.map((f) => f.estado), ["REGISTRADO", "REGISTRADO", "REGISTRADO"]);
  assert.match(filas[1].motivo!, /misma referencia/);
  assert.match(filas[2].motivo!, /mismo saldo/);
});

test("misma fecha y monto NO basta: distinta referencia o saldo = nuevo; sin datos y descripción parecida = por revisar", () => {
  const filas = clasificar(
    conHuellas([
      mov(1, "2026-10-05", 85000, { referencia: "7002", descripcion: "TRANSF DE LUIS" }),
      mov(2, "2026-10-05", 120000, { descripcion: "DEPOSITO EN EFECTIVO CAJA" }),
      mov(3, "2026-10-05", 60000, { descripcion: "TRANSF DE PEDRO SOTO" }),
      mov(4, "2026-10-06", 5000, { descripcion: "ABONO", saldo: 10 }),
    ]),
    [
      guardado("g1", "2026-10-05", 85000, { referencia: "7001", descripcion: "TRANSF DE ANA" }),
      guardado("g2", "2026-10-05", 120000, { descripcion: "DEP. EFECTIVO CAJA", saldo: 500 }),
      guardado("g3", "2026-10-05", 60000, { descripcion: "PAGO PROVEEDOR GAS" }),
      guardado("g4", "2026-10-06", 5000, { descripcion: "ABONO", saldo: 20 }),
    ],
  );
  assert.deepEqual(filas.map((f) => f.estado), ["NUEVO", "POSIBLE_DUPLICADO", "NUEVO", "NUEVO"]);
  assert.equal(filas[1].parecido?.descripcion, "DEP. EFECTIVO CAJA");
  assert.match(filas[0].motivo!, /se considera distinto/);
});

test("un movimiento guardado se usa una sola vez", () => {
  const filas = clasificar(
    conHuellas([mov(1, "2026-10-05", 1000, { referencia: "1" }), mov(2, "2026-10-05", 1000, { referencia: "1" })]),
    [guardado("g", "2026-10-05", 1000, { referencia: "1" })],
  );
  assert.deepEqual(filas.map((f) => f.estado), ["REGISTRADO", "NUEVO"]);
});

test("parecido de descripciones", () => {
  assert.equal(parecido("DEPOSITO EN EFECTIVO CAJA", "DEP. EFECTIVO CAJA") >= 0.5, true);
  assert.equal(parecido("TRANSF DE ANA", "PAGO PROVEEDOR GAS") < 0.5, true);
  assert.equal(parecido(null, "X"), 1);
});
