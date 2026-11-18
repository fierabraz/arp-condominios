// FIN-COMP · Entrega C · Cierre del mes contra la base (datos ficticios).
// Solo contra una base de PRUEBA: npm run test:bd
import "dotenv/config";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { borrarConstancias } from "./limpieza";
import { anularPago, emitirPeriodo, ErrorCobro, previsualizarPeriodo, registrarPago } from "../src/lib/cobro-servicio";
import { registrarIngresoDesdeMovimiento } from "../src/lib/conciliacion-servicio";
import { cerrarMes, datosCierre, ErrorCierre, reabrirMes } from "../src/lib/cierre-servicio";
import { ErrorEgreso, registrarPagoEgreso } from "../src/lib/egresos-servicio";

if (/neon\.tech|vercel/i.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Estas pruebas crean y borran datos: no se ejecutan contra una base de Neon o Vercel.");
}

const creadas: string[] = [];
before(async () => {
  await db.$connect();
});
after(async () => {
  for (const id of creadas) {
    await borrarConstancias(id);
    await db.registroCambio.deleteMany({ where: { administradoraId: id } });
    await db.conciliacionMovimiento.deleteMany({ where: { administradoraId: id } });
    await db.movimientoBancario.deleteMany({ where: { administradoraId: id } });
    await db.importacionCartola.deleteMany({ where: { administradoraId: id } });
    await db.aplicacionPago.deleteMany({ where: { pago: { administradoraId: id } } });
    await db.pago.deleteMany({ where: { administradoraId: id } });
    await db.avisoCobro.deleteMany({ where: { administradoraId: id } });
    await db.gasto.deleteMany({ where: { administradoraId: id } });
    await db.movimientoFondo.deleteMany({ where: { fondo: { administradoraId: id } } });
    await db.fondo.deleteMany({ where: { administradoraId: id } });
    await db.administradora.delete({ where: { id } });
  }
  await db.$disconnect();
});

const dia = (s: string) => new Date(`${s}T12:00:00Z`);

async function escenario() {
  const adm = await db.administradora.create({ data: { nombre: `Prueba cierre ${Date.now()}-${Math.random()}` } });
  creadas.push(adm.id);
  const c = await db.condominio.create({
    data: { administradoraId: adm.id, nombre: "Comunidad Ficticia", direccion: "Calle 1", estado: "HABILITADA_FINANCIERA", porcentajeReserva: 0 },
  });
  const u1 = await db.unidad.create({ data: { administradoraId: adm.id, condominioId: c.id, numero: "101", alicuota: 50 } });
  const u2 = await db.unidad.create({ data: { administradoraId: adm.id, condominioId: c.id, numero: "102", alicuota: 50 } });
  const autor = { id: "admin-prueba", nombre: "Administradora Ficticia", administradoraId: adm.id };
  const periodo = async (anio: number, mes: number, gastos: number) => {
    const p = await db.periodo.create({ data: { administradoraId: adm.id, condominioId: c.id, anio, mes } });
    if (gastos) {
      await db.gasto.create({
        data: { administradoraId: adm.id, periodoId: p.id, tipo: "COMUN", categoria: "Aseo", descripcion: "Aseo", monto: gastos, fecha: dia(`${anio}-${String(mes).padStart(2, "0")}-05`), estadoPago: "PAGADO", fechaPago: dia(`${anio}-${String(mes).padStart(2, "0")}-05`) },
      });
    }
    return p;
  };
  const cuenta = await db.cuentaBancaria.create({
    data: { administradoraId: adm.id, condominioId: c.id, banco: "Banco Ficticio", tipo: "CORRIENTE", numeroFinal: "4321", creadoPor: "Prueba" },
  });
  let n = 0;
  const movimiento = async (fecha: string, monto: number) => {
    const imp = await db.importacionCartola.create({
      data: {
        administradoraId: adm.id, condominioId: c.id, cuentaId: cuenta.id, banco: cuenta.banco, archivoNombre: `c${n}.csv`, archivoHuella: `h${n}`,
        archivoTamano: 1, formato: "CSV", encontrados: 1, nuevos: 1, yaRegistrados: 0, posiblesDuplicados: 0, duplicadosOmitidos: 0, errores: 0, estado: "APLICADA", usuarioNombre: "Prueba",
      },
    });
    return db.movimientoBancario.create({
      data: { administradoraId: adm.id, condominioId: c.id, cuentaId: cuenta.id, importacionId: imp.id, fecha: dia(fecha), monto, huella: `m${n++}` },
    });
  };
  return { adm, c, u1, u2, autor, periodo, movimiento };
}

describe("FIN-COMP C · cierre del mes", () => {
  test("no se cierra sin emitir, con meses anteriores abiertos ni con la cartola sin conciliar", async () => {
    const e = await escenario();
    const sep = await e.periodo(2026, 9, 100000);
    const oct = await e.periodo(2026, 10, 200000);
    const d = (await datosCierre(oct.id, e.adm.id))!;
    assert.ok(d.revision.bloqueos.some((b) => /emitir/.test(b)));
    assert.ok(d.revision.bloqueos.some((b) => /Septiembre 2026/i.test(b)));

    await emitirPeriodo(sep.id, e.adm.id);
    await emitirPeriodo(oct.id, e.adm.id);
    await e.movimiento("2026-09-20", 3000);
    await assert.rejects(cerrarMes(e.autor, sep.id, true), (err: Error) => err instanceof ErrorCierre && /sin conciliar/.test(err.message));
    await assert.rejects(cerrarMes(e.autor, oct.id, true), (err: Error) => err instanceof ErrorCierre && /Cierra antes/.test(err.message));
  });

  test("las advertencias se confirman; el cierre guarda un resumen fijo y queda en el registro", async () => {
    const e = await escenario();
    const oct = await e.periodo(2026, 10, 200000);
    await emitirPeriodo(oct.id, e.adm.id);
    // Pago registrado desde la cartola: el banco cuadra.
    const m = await e.movimiento("2026-10-20", 100000);
    await registrarIngresoDesdeMovimiento(e.autor, { condominioId: e.c.id, movimientoId: m.id, unidadId: e.u1.id, monto: 100000 });
    const d = (await datosCierre(oct.id, e.adm.id))!;
    assert.deepEqual(d.revision.bloqueos, []);
    await e.movimiento("2026-10-25", -1); // un cargo sin conciliar: vuelve a bloquear
    await assert.rejects(cerrarMes(e.autor, oct.id, true), /sin conciliar/);
    await db.movimientoBancario.deleteMany({ where: { condominioId: e.c.id, monto: -1 } });

    const sinConfirmar = (await datosCierre(oct.id, e.adm.id))!;
    if (sinConfirmar.revision.advertencias.length) {
      await assert.rejects(cerrarMes(e.autor, oct.id, false), /confirma/);
    }
    const resumen = await cerrarMes(e.autor, oct.id, true);
    assert.equal(resumen.emitido, 200000);
    assert.equal(resumen.ingresosDelMes, 100000);
    assert.equal(resumen.pendienteDelMes, 100000);
    assert.equal(resumen.bancos[0].abonos, 100000);
    const p = await db.periodo.findUniqueOrThrow({ where: { id: oct.id } });
    assert.ok(p.mesCerradoEn);
    assert.equal((p.resumenCierre as { ingresosDelMes: number }).ingresosDelMes, 100000);
    const reg = await db.registroCambio.findFirst({ where: { administradoraId: e.adm.id, accion: "Cerró el mes" } });
    assert.ok(reg);
    await assert.rejects(cerrarMes(e.autor, oct.id, true), /ya está cerrado/);
  });

  test("mes cerrado: no se registran, anulan ni concilian cosas con su fecha; un pago posterior paga la deuda antigua sin cambiar el resumen", async () => {
    const e = await escenario();
    const oct = await e.periodo(2026, 10, 200000);
    await emitirPeriodo(oct.id, e.adm.id);
    const pago = await registrarPago(e.adm.id, { unidadId: e.u1.id, monto: 50000, fecha: dia("2026-10-10"), medio: "EFECTIVO" });
    const egreso = await db.gasto.create({
      data: { administradoraId: e.adm.id, periodoId: oct.id, tipo: "COMUN", categoria: "Luz", descripcion: "Luz", monto: 1000, fecha: dia("2026-10-05"), estadoPago: "POR_PAGAR" },
    });
    await cerrarMes(e.autor, oct.id, true);

    await assert.rejects(
      registrarPago(e.adm.id, { unidadId: e.u2.id, monto: 1000, fecha: dia("2026-10-28"), medio: "EFECTIVO" }),
      (err: Error) => err instanceof ErrorCobro && /Octubre 2026 está cerrado/i.test(err.message),
    );
    await assert.rejects(anularPago(pago.id, e.adm.id, { por: "Prueba", motivo: "error de prueba" }), (err: Error) => err instanceof ErrorCobro && /cerrado/.test(err.message));
    await assert.rejects(
      registrarPagoEgreso(e.autor, { condominioId: e.c.id, gastoId: egreso.id, fechaPago: dia("2026-10-30"), medioPago: "TRANSFERENCIA" }),
      (err: Error) => err instanceof ErrorEgreso && /cerrado/.test(err.message),
    );
    const mov = await e.movimiento("2026-10-29", 5000);
    await assert.rejects(
      registrarIngresoDesdeMovimiento(e.autor, { condominioId: e.c.id, movimientoId: mov.id, unidadId: e.u2.id, monto: 5000 }),
      (err: Error) => /cerrado/.test(err.message),
    );

    // D-FIN-08: llega en noviembre, con su fecha real, y paga octubre.
    const tarde = await registrarPago(e.adm.id, { unidadId: e.u2.id, monto: 100000, fecha: dia("2026-11-03"), medio: "EFECTIVO" });
    const aplicado = await db.aplicacionPago.findFirst({ where: { pagoId: tarde.id }, include: { aviso: true } });
    assert.equal(aplicado?.aviso.periodoId, oct.id);
    const p = await db.periodo.findUniqueOrThrow({ where: { id: oct.id } });
    assert.equal((p.resumenCierre as { pendienteDelMes: number }).pendienteDelMes, 150000);
  });

  test("reabrir: solo con motivo, del más reciente al más antiguo y queda auditado", async () => {
    const e = await escenario();
    const sep = await e.periodo(2026, 9, 100000);
    const oct = await e.periodo(2026, 10, 100000);
    await emitirPeriodo(sep.id, e.adm.id);
    await emitirPeriodo(oct.id, e.adm.id);
    await cerrarMes(e.autor, sep.id, true);
    await cerrarMes(e.autor, oct.id, true);
    await assert.rejects(reabrirMes(e.autor, oct.id, "corto"), /mínimo 10/);
    await assert.rejects(reabrirMes(e.autor, sep.id, "faltó un pago de la cartola"), /Primero reabre Octubre 2026/i);
    await reabrirMes(e.autor, oct.id, "faltó un pago de la cartola");
    const p = await db.periodo.findUniqueOrThrow({ where: { id: oct.id } });
    assert.equal(p.mesCerradoEn, null);
    assert.equal(p.motivoReapertura, "faltó un pago de la cartola");
    const reg = await db.registroCambio.findFirst({ where: { administradoraId: e.adm.id, accion: "Reabrió un mes cerrado" } });
    assert.ok(reg && /faltó un pago/.test(reg.detalle ?? ""));
    // Reabierto, se puede volver a registrar con fecha de octubre.
    await registrarPago(e.adm.id, { unidadId: e.u1.id, monto: 1000, fecha: dia("2026-10-28"), medio: "EFECTIVO" });
  });

  test("un porcentaje de prorrateo provisional impide emitir", async () => {
    const e = await escenario();
    await db.unidad.update({ where: { id: e.u1.id }, data: { prorrateoProvisional: true } });
    const oct = await e.periodo(2026, 10, 1000);
    await assert.rejects(previsualizarPeriodo(oct.id, e.adm.id), /provisional/);
    await assert.rejects(emitirPeriodo(oct.id, e.adm.id), /provisional/);
  });
});
