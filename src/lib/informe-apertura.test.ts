import { test } from "node:test";
import assert from "node:assert/strict";
import { resumenApertura, revisarApertura } from "./apertura";
import { AVISO_BORRADOR, informeApertura, LEYENDA_INFORME, lotesDeudas, textoInforme, type DatosInforme } from "./informe-apertura";

const corte = new Date("2026-11-30");
const deuda = (unidadId: string, periodo: string, saldo: number, estado: "CONFIRMADA" | "DISCUTIDA" | "POR_VERIFICAR" = "CONFIRMADA", origen = "pantalla") => ({
  unidadId,
  periodo,
  concepto: "Gasto común",
  saldo,
  estado,
  origen,
  respaldo: null,
});

function datos(): DatosInforme {
  const d = {
    fechaCorte: corte,
    deudas: [
      deuda("u1", "2026-09", 65000, "CONFIRMADA", "deudas.xlsx, fila 2"),
      deuda("u1", "2026-10", 72000, "CONFIRMADA", "deudas.xlsx, fila 3"),
      deuda("u2", "2026-11", 40000, "DISCUTIDA"),
    ],
    creditos: [{ unidadId: "u3", monto: 10000 }, { unidadId: null, monto: 5000 }],
    fondos: [{ tipo: "RESERVA" as const, nombre: "Fondo de reserva", saldoContable: 500000, pendienteRecaudar: null }],
    cuentas: [{ tipo: "CORRIENTE" as const, banco: "Banco Ficticio", numeroFinal: "4321", saldoCartola: 520000, chequesNoCobrados: 20000, depositosNoAbonados: 0 }],
    obligaciones: [{ tipo: "REMUNERACION" as const, monto: 300000, fondo: null, documento: "Liquidación 11-2026" }],
  };
  const resumen = resumenApertura(d);
  return {
    administradora: "Administradora Ficticia",
    comunidad: { nombre: "Comunidad Ficticia", direccion: "Calle 5", comuna: "Ñuñoa", tipo: "EDIFICIO", modalidad: "EXISTENTE", fechaIncorporacion: new Date("2026-12-01"), estado: "HABILITADA_ADMINISTRATIVA" },
    apertura: { fechaCorte: corte, estado: "EN_REVISION", preparadoPor: "Admin Demo", actualizadoEn: new Date("2026-12-02T15:00:00Z"), observaciones: null },
    estructura: { totalDeclarado: 4, unidadesPorTipo: [{ tipo: "DEPARTAMENTO", cantidad: 4 }], sumaAlicuotas: 100, agrupaciones: 1, espacios: [], instalaciones: 0 },
    personas: { propietarios: 3, residentes: 2, unidadesSinPropietario: 1, unidades: 4 },
    datos: d,
    resumen,
    revision: revisarApertura(d, resumen),
    pendientesActivacion: ["Aprobar la apertura y empezar a cobrar sobre esos saldos queda restringido hasta que se aprueben las reglas de apertura (D-COM-05 a D-COM-08)."],
    generado: new Date("2026-12-02T16:00:00Z"),
    generadoPor: "Admin Demo",
  };
}

test("el informe sigue el orden de la propuesta y lleva la leyenda y el aviso de borrador", () => {
  const i = informeApertura(datos());
  assert.deepEqual(
    i.secciones.map((s) => s.titulo.replace(/^\d+\. /, "")),
    [
      "Identificación",
      "Estructura",
      "Personas",
      "Deudas de unidades a la fecha de corte",
      "Saldos a favor y pagos por identificar",
      "Fondos",
      "Bancos y caja",
      "Obligaciones con terceros",
      "Documentos de respaldo y lotes de carga",
      "Advertencias",
      "Preparación y aprobación",
    ],
  );
  assert.equal(i.aviso, AVISO_BORRADOR);
  assert.equal(i.leyenda, LEYENDA_INFORME);
  const t = textoInforme(i);
  assert.match(t, /1 de diciembre de 2026/); // inicio en Convive: el día siguiente al corte
  assert.match(t, /\$\s?177\.000/); // total de deudas
  assert.match(t, /\$\s?137\.000/); // cobrable: sin la discutida
  assert.match(t, /1 deuda discutida\./);
  assert.match(t, /restringido/);
});

test("el informe no lleva nombres de acreedores ni números de cuenta completos", () => {
  const d = datos();
  d.datos.obligaciones = [{ tipo: "REMUNERACION", monto: 300000, fondo: null, documento: "x", acreedor: "Juana Pérez Ficticia" } as never];
  d.datos.cuentas[0].numeroFinal = "000123454321";
  const t = textoInforme(informeApertura(d));
  assert.doesNotMatch(t, /Juana/);
  assert.doesNotMatch(t, /000123454321/);
  assert.match(t, /···4321/);
  assert.match(t, /Remuneraciones/);
});

test("lotes de carga: cada planilla es un lote y lo de pantalla otro", () => {
  assert.deepEqual(lotesDeudas(datos().datos.deudas), [
    { lote: "Ingresadas en pantalla", deudas: 1, saldo: 40000 },
    { lote: "Planilla deudas.xlsx", deudas: 2, saldo: 137000 },
  ]);
});
