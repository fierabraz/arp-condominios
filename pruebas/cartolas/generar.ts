// FIN-003.1 · Genera las cartolas FICTICIAS de demostración y prueba (nombres, montos y números de
// operación inventados; ningún dato de clientes reales). Ejecutar: npx tsx pruebas/cartolas/generar.ts
//
// A · cartola-a-octubre-1-al-15.xlsx: columnas convencionales (Fecha, N° Documento, Descripción,
//     Cargos, Abonos, Saldo), fechas de Excel, saldo en cada fila, encabezado del banco arriba,
//     totales abajo y una segunda hoja «Resumen» sin movimientos.
// B · cartola-b-octubre-completo.csv: otro banco/formato (F. Contable, Glosa del Movimiento,
//     Nro. Op., Débitos/Giros, Créditos/Depósitos, Saldo Diario), fechas «01-oct-2026», montos con
//     punto de miles, saldo solo al final de cada día. Repite del 1 al 15 de octubre (lo de A) y
//     agrega del 16 al 31.
// C · cartola-c-noviembre.csv: mismo formato que B (para comprobar que el perfil se reutiliza).

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import writeXlsxFile from "write-excel-file/node";

type Mov = { dia: string; ref?: string; desc: string; monto: number };
const carpeta = __dirname;

const PRIMERA_QUINCENA: Mov[] = [
  { dia: "2026-10-01", ref: "7001234", desc: "TRANSFERENCIA DE CAMILA FUENTES DEPTO 101", monto: 85_000 },
  { dia: "2026-10-01", ref: "7001240", desc: "TRANSFERENCIA DE ROBERTO LAGOS DEPTO 102", monto: 92_500 },
  { dia: "2026-10-02", ref: "551203", desc: "PAGO PROVEEDOR ASEO LIMPIEZAS DEL SUR SPA", monto: -420_000 },
  { dia: "2026-10-03", ref: "7001302", desc: "TRANSFERENCIA DE ANDREA MUÑOZ DEPTO 201", monto: 85_000 },
  { dia: "2026-10-03", ref: "7001303", desc: "TRANSFERENCIA DE PABLO CORTES DEPTO 202", monto: 85_000 },
  { dia: "2026-10-05", desc: "DEPOSITO EN EFECTIVO CAJA", monto: 120_000 },
  { dia: "2026-10-05", ref: "7001350", desc: "TRANSFERENCIA DE LUCIA PEÑA DEPTO 203", monto: 120_000 },
  { dia: "2026-10-06", ref: "551250", desc: "PAGO SERVICIO ELECTRICIDAD AREAS COMUNES", monto: -186_430 },
  { dia: "2026-10-08", ref: "7001410", desc: "TRANSFERENCIA DE SOFIA REYES DEPTO 301", monto: 110_000 },
  { dia: "2026-10-10", desc: "COMISION MANTENCION CUENTA CORRIENTE", monto: -8_900 },
  { dia: "2026-10-12", ref: "551301", desc: "PAGO SERVICIO AGUA POTABLE", monto: -98_750 },
  { dia: "2026-10-14", ref: "7001502", desc: "TRANSFERENCIA DE TOMAS VERA DEPTO 302", monto: 85_000 },
  { dia: "2026-10-15", ref: "551340", desc: "PAGO REMUNERACION CONSERJE OCTUBRE", monto: -650_000 },
];

const SEGUNDA_QUINCENA: Mov[] = [
  { dia: "2026-10-16", ref: "7001601", desc: "TRANSF DE CAMILA FUENTES DEPTO 101", monto: 85_000 },
  { dia: "2026-10-18", ref: "551402", desc: "PAGO MANTENCION ASCENSORES", monto: -310_000 },
  { dia: "2026-10-20", ref: "7001655", desc: "TRANSF DE ROBERTO LAGOS DEPTO 102", monto: 92_500 },
  { dia: "2026-10-22", ref: "7001690", desc: "TRANSF DE ANDREA MUÑOZ DEPTO 201", monto: 85_000 },
  { dia: "2026-10-22", ref: "7001691", desc: "TRANSF DE PABLO CORTES DEPTO 202", monto: 85_000 },
  { dia: "2026-10-25", desc: "DEP. EFECTIVO CAJA", monto: 60_000 },
  { dia: "2026-10-28", ref: "551460", desc: "PAGO JARDINERIA LOS AROMOS LTDA", monto: -145_000 },
  { dia: "2026-10-31", desc: "COMISION MANTENCION CTA CTE", monto: -8_900 },
];

const NOVIEMBRE: Mov[] = [
  { dia: "2026-11-02", ref: "7001801", desc: "TRANSF DE CAMILA FUENTES DEPTO 101", monto: 85_000 },
  { dia: "2026-11-03", ref: "7001811", desc: "TRANSF DE SOFIA REYES DEPTO 301", monto: 110_000 },
  { dia: "2026-11-04", ref: "551520", desc: "PAGO PROVEEDOR ASEO LIMPIEZAS DEL SUR SPA", monto: -420_000 },
  { dia: "2026-11-05", ref: "7001840", desc: "TRANSF DE TOMAS VERA DEPTO 302", monto: 85_000 },
  { dia: "2026-11-09", desc: "COMISION MANTENCION CTA CTE", monto: -8_900 },
];

const SALDO_INICIAL = 2_450_000;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fechaTexto = (iso: string) => `${iso.slice(8)}-${MESES[Number(iso.slice(5, 7)) - 1]}-${iso.slice(0, 4)}`;
const miles = (n: number) => Math.abs(n).toLocaleString("es-CL");

/** Saldo después de cada movimiento. */
function conSaldos(movs: Mov[], inicial: number) {
  let saldo = inicial;
  return movs.map((m) => ({ ...m, saldo: (saldo += m.monto) }));
}

async function cartolaA() {
  const filas = conSaldos(PRIMERA_QUINCENA, SALDO_INICIAL);
  const n = (v: number) => ({ value: v, format: "#,##0" });
  const t = (v: string) => ({ value: v });
  const data = [
    [t("BANCO FICTICIO DEL PACÍFICO")],
    [t("Cartola de movimientos — Cuenta corriente")],
    [t("Titular: Comunidad Edificio Los Aromos (ficticia)")],
    [t("Cuenta N°: ****4521")],
    [t("Período: 01/10/2026 al 15/10/2026")],
    [],
    [t("Fecha"), t("N° Documento"), t("Descripción"), t("Cargos ($)"), t("Abonos ($)"), t("Saldo ($)")],
    [{ value: new Date("2026-10-01T00:00:00Z"), format: "dd/mm/yyyy" }, null, t("Saldo inicial"), null, null, n(SALDO_INICIAL)],
    ...filas.map((m) => [
      { value: new Date(`${m.dia}T00:00:00Z`), format: "dd/mm/yyyy" },
      m.ref ? t(m.ref) : null,
      t(m.desc),
      m.monto < 0 ? n(-m.monto) : null,
      m.monto > 0 ? n(m.monto) : null,
      n(m.saldo),
    ]),
    [],
    [null, null, t("Total cargos"), n(-filas.filter((m) => m.monto < 0).reduce((s, m) => s + m.monto, 0)), null, null],
    [null, null, t("Total abonos"), null, n(filas.filter((m) => m.monto > 0).reduce((s, m) => s + m.monto, 0)), null],
  ];
  const resumen = [
    [t("Resumen del período")],
    [t("Saldo inicial"), n(SALDO_INICIAL)],
    [t("Total abonos"), n(filas.filter((m) => m.monto > 0).reduce((s, m) => s + m.monto, 0))],
    [t("Total cargos"), n(-filas.filter((m) => m.monto < 0).reduce((s, m) => s + m.monto, 0))],
    [t("Saldo final"), n(filas[filas.length - 1].saldo)],
  ];
  const libro = await writeXlsxFile([
    { sheet: "Movimientos", data, columns: [{ width: 12 }, { width: 14 }, { width: 46 }, { width: 14 }, { width: 14 }, { width: 14 }] },
    { sheet: "Resumen", data: resumen },
  ]).toBuffer();
  writeFileSync(join(carpeta, "cartola-a-octubre-1-al-15.xlsx"), libro);
}

/** Formato B: saldo solo en el último movimiento de cada día, montos «1.250.000», fechas «01-oct-2026». */
function csvB(movs: Mov[], inicial: number, titulo: string) {
  const filas = conSaldos(movs, inicial);
  const lineas = [
    titulo,
    "",
    "F. Contable;Glosa del Movimiento;Nro. Op.;Débitos/Giros;Créditos/Depósitos;Saldo Diario",
    ...filas.map((m, i) => {
      const ultimoDelDia = filas[i + 1]?.dia !== m.dia;
      return [fechaTexto(m.dia), `"${m.desc}"`, m.ref ?? "", m.monto < 0 ? miles(m.monto) : "", m.monto > 0 ? miles(m.monto) : "", ultimoDelDia ? miles(m.saldo) : ""].join(";");
    }),
    `;Saldo final;;;;${miles(filas[filas.length - 1].saldo)}`,
  ];
  return { texto: lineas.join("\r\n") + "\r\n", final: filas[filas.length - 1].saldo };
}

async function main() {
await cartolaA();
const b = csvB([...PRIMERA_QUINCENA, ...SEGUNDA_QUINCENA], SALDO_INICIAL, "Banco Ficticio del Pacífico - Movimientos cuenta ****4521 - Octubre 2026");
writeFileSync(join(carpeta, "cartola-b-octubre-completo.csv"), b.texto);
const c = csvB(NOVIEMBRE, b.final, "Banco Ficticio del Pacífico - Movimientos cuenta ****4521 - Noviembre 2026");
writeFileSync(join(carpeta, "cartola-c-noviembre.csv"), c.texto);
console.log("Cartolas ficticias generadas en", carpeta);
}
main();
