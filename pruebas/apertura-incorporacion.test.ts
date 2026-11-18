// FIN-COMP · Entrega D · Incorporar la apertura de una comunidad existente (datos ficticios).
// Solo contra una base de PRUEBA: npm run test:bd
import "dotenv/config";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { borrarConstancias } from "./limpieza";
import { estadoCuenta, registrarPago } from "../src/lib/cobro-servicio";
import { ErrorIncorporacion, incorporarApertura } from "../src/lib/apertura-incorporacion";
import { saldosFondos } from "../src/lib/egresos-servicio";

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

const dia = (s: string) => new Date(`${s}T00:00:00Z`);

async function escenario(estado: "HABILITADA_FINANCIERA" | "EN_CONFIGURACION" = "HABILITADA_FINANCIERA") {
  const adm = await db.administradora.create({ data: { nombre: `Prueba apertura ${Date.now()}-${Math.random()}` } });
  creadas.push(adm.id);
  const c = await db.condominio.create({
    data: { administradoraId: adm.id, nombre: "Comunidad Ficticia", direccion: "Calle 1", estado, modalidad: "EXISTENTE", porcentajeReserva: 0 },
  });
  const u1 = await db.unidad.create({ data: { administradoraId: adm.id, condominioId: c.id, numero: "101", alicuota: 50 } });
  const u2 = await db.unidad.create({ data: { administradoraId: adm.id, condominioId: c.id, numero: "102", alicuota: 50 } });
  const autor = { id: "admin-prueba", nombre: "Administradora Ficticia", administradoraId: adm.id };
  const a = await db.apertura.create({ data: { administradoraId: adm.id, condominioId: c.id, fechaCorte: dia("2026-09-30"), preparadoPor: "Prueba", estado: "EN_REVISION" } });
  const por = { creadoPor: "Prueba" };
  await db.deudaApertura.createMany({
    data: [
      { aperturaId: a.id, unidadId: u1.id, periodo: "2026-08", concepto: "Gasto común", saldo: 80000, ...por },
      { aperturaId: a.id, unidadId: u1.id, periodo: "2026-09", concepto: "Fondo de reserva", saldo: 5000, ...por },
      { aperturaId: a.id, unidadId: u1.id, periodo: "2026-09", concepto: "Multa", saldo: 10000, estado: "EN_CONVENIO", ...por },
      { aperturaId: a.id, unidadId: u2.id, periodo: "2026-09", concepto: "Gasto común", saldo: 70000, estado: "DISCUTIDA", ...por },
    ],
  });
  await db.creditoApertura.create({ data: { aperturaId: a.id, unidadId: u2.id, monto: 15000, ...por } });
  await db.creditoApertura.create({ data: { aperturaId: a.id, monto: 3000, descripcion: "Depósito sin identificar", ...por } });
  await db.fondoApertura.create({ data: { aperturaId: a.id, tipo: "RESERVA", nombre: "Fondo común de reserva", saldoContable: 1200000, ...por } });
  await db.fondoApertura.create({ data: { aperturaId: a.id, tipo: "PROYECTO", nombre: "Pintura fachada", saldoContable: 300000, ...por } });
  await db.cuentaApertura.create({ data: { aperturaId: a.id, tipo: "CORRIENTE", banco: "Banco Ficticio", numeroFinal: "9876", saldoCartola: 1500000, ...por } });
  await db.obligacionApertura.create({ data: { aperturaId: a.id, tipo: "PROVEEDOR", acreedor: "Ascensores Inventados", monto: 250000, fondo: "Pintura fachada", ...por } });
  return { adm, c, u1, u2, autor, a };
}

describe("FIN-COMP D · incorporar la apertura", () => {
  test("pasa las deudas cobrables, saldos a favor, fondos, cuentas y cuentas por pagar, y cierra el mes de apertura", async () => {
    const e = await escenario();
    const r = await incorporarApertura(e.autor, e.c.id);
    assert.equal(r.avisos, 1); // la deuda discutida de la 102 no se cobra
    assert.equal(r.emitido, 95000);
    assert.equal(r.noCobradas, 1);
    assert.equal(r.sinUnidad, 1);

    const p = await db.periodo.findUniqueOrThrow({ where: { id: r.periodoId } });
    assert.equal(p.deApertura, true);
    assert.ok(p.mesCerradoEn);
    assert.equal(`${p.anio}-${p.mes}`, "2026-9");

    const aviso = await db.avisoCobro.findFirstOrThrow({ where: { periodoId: p.id, unidadId: e.u1.id } });
    assert.equal(Number(aviso.gastoComun), 80000);
    assert.equal(Number(aviso.fondoReserva), 5000);
    assert.equal(Number(aviso.cargos), 10000);
    const cuenta1 = (await estadoCuenta(e.u1.id, e.adm.id))!;
    assert.equal(Number(cuenta1.vencida), 95000);
    const cuenta2 = (await estadoCuenta(e.u2.id, e.adm.id))!;
    assert.equal(Number(cuenta2.aFavor), 15000);

    const fondos = await saldosFondos(e.c.id, e.adm.id);
    const reserva = fondos.find((f) => f.fondo.tipo === "RESERVA")!;
    assert.equal(reserva.saldoInicial, 1200000);
    const pintura = fondos.find((f) => f.fondo.nombre === "Pintura fachada")!;
    assert.equal(pintura.saldo, 50000); // 300.000 menos la cuenta por pagar que se paga con ese fondo
    assert.equal(await db.cuentaBancaria.count({ where: { condominioId: e.c.id, numeroFinal: "9876" } }), 1);
    const egreso = await db.gasto.findFirstOrThrow({ where: { periodoId: p.id } });
    assert.equal(egreso.estadoPago, "POR_PAGAR");
    assert.equal(Number(egreso.monto), 250000);

    const ap = await db.apertura.findUniqueOrThrow({ where: { id: e.a.id } });
    assert.equal(ap.estado, "INCORPORADA");
    assert.ok(await db.registroCambio.findFirst({ where: { administradoraId: e.adm.id, accion: "Incorporó la apertura a las finanzas" } }));

    // Una sola vez.
    await assert.rejects(incorporarApertura(e.autor, e.c.id), (err: Error) => err instanceof ErrorIncorporacion && /ya está incorporada/.test(err.message));
    // Un pago con fecha del mes de apertura no se puede (es del sistema anterior); con fecha real paga la deuda traída.
    await assert.rejects(registrarPago(e.adm.id, { unidadId: e.u1.id, monto: 1000, fecha: dia("2026-09-15"), medio: "EFECTIVO" }), /cerrado/);
    await registrarPago(e.adm.id, { unidadId: e.u1.id, monto: 95000, fecha: dia("2026-10-05"), medio: "EFECTIVO" });
    assert.equal(Number((await db.avisoCobro.findUniqueOrThrow({ where: { id: aviso.id } })).saldo), 0);
  });

  test("no se incorpora en borrador, sin habilitación financiera ni con meses de Convive anteriores al corte", async () => {
    const e = await escenario("EN_CONFIGURACION");
    await assert.rejects(incorporarApertura(e.autor, e.c.id), /habilitada financieramente/);

    const f = await escenario();
    await db.apertura.update({ where: { id: f.a.id }, data: { estado: "BORRADOR" } });
    await assert.rejects(incorporarApertura(f.autor, f.c.id), /Lista para revisión/);
    await db.apertura.update({ where: { id: f.a.id }, data: { estado: "EN_REVISION" } });
    await db.periodo.create({ data: { administradoraId: f.adm.id, condominioId: f.c.id, anio: 2026, mes: 9 } });
    await assert.rejects(incorporarApertura(f.autor, f.c.id), /anterior o igual a la fecha de corte/);
    assert.equal(await db.avisoCobro.count({ where: { administradoraId: f.adm.id } }), 0); // nada a medias
  });
});
