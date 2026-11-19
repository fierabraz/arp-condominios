// FIN-COMP · Entrega B · Egresos, conciliación de cargos y fondos contra la base (datos ficticios).
// Solo contra una base de PRUEBA: npm run test:bd
import "dotenv/config";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { borrarConstancias } from "./limpieza";
import { emitirPeriodo } from "../src/lib/cobro-servicio";
import { deshacerConciliacion, registrarIngresoDesdeMovimiento } from "../src/lib/conciliacion-servicio";
import {
  anularPagoEgreso,
  conciliarCargoConEgreso,
  ErrorEgreso,
  registrarMovimientoFondo,
  registrarOtroEgreso,
  registrarPagoEgreso,
  saldosFondos,
  sugerenciasDeCargo,
  subirRespaldo,
} from "../src/lib/egresos-servicio";

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
    await db.conciliacionMovimiento.deleteMany({ where: { administradoraId: id } });
    await db.movimientoBancario.deleteMany({ where: { administradoraId: id } });
    await db.importacionCartola.deleteMany({ where: { administradoraId: id } });
    await db.gasto.deleteMany({ where: { administradoraId: id } });
    await db.movimientoFondo.deleteMany({ where: { fondo: { administradoraId: id } } });
    await db.fondo.deleteMany({ where: { administradoraId: id } });
    await db.administradora.delete({ where: { id } });
  }
  await db.$disconnect();
});

const dia = (s: string) => new Date(`${s}T00:00:00Z`);

async function escenario() {
  const adm = await db.administradora.create({ data: { nombre: `Prueba egresos ${Date.now()}-${Math.random()}` } });
  creadas.push(adm.id);
  const c = await db.condominio.create({
    data: { administradoraId: adm.id, nombre: "Comunidad Ficticia", direccion: "Calle 1", estado: "HABILITADA_FINANCIERA", porcentajeReserva: 10 },
  });
  const u1 = await db.unidad.create({ data: { administradoraId: adm.id, condominioId: c.id, numero: "101", alicuota: 50 } });
  await db.unidad.create({ data: { administradoraId: adm.id, condominioId: c.id, numero: "102", alicuota: 50 } });
  const admin = { id: "admin-prueba", nombre: "Administradora Ficticia", administradoraId: adm.id };
  const oct = await db.periodo.create({ data: { administradoraId: adm.id, condominioId: c.id, anio: 2026, mes: 10 } });
  const gasto = (descripcion: string, monto: number, extra: { proveedor?: string; fondoId?: string } = {}) =>
    db.gasto.create({ data: { administradoraId: adm.id, periodoId: oct.id, tipo: "COMUN", categoria: "Aseo", descripcion, monto, fecha: dia("2026-10-15"), ...extra } });
  const cuenta = await db.cuentaBancaria.create({
    data: { administradoraId: adm.id, condominioId: c.id, banco: "Banco Ficticio", tipo: "CORRIENTE", numeroFinal: "4321", creadoPor: "Prueba" },
  });
  let n = 0;
  const movimiento = async (fecha: string, monto: number, descripcion?: string) => {
    const imp = await db.importacionCartola.create({
      data: {
        administradoraId: adm.id, condominioId: c.id, cuentaId: cuenta.id, banco: cuenta.banco, archivoNombre: `c${n}.csv`, archivoHuella: `h${n}`,
        archivoTamano: 1, formato: "CSV", encontrados: 1, nuevos: 1, yaRegistrados: 0, posiblesDuplicados: 0, duplicadosOmitidos: 0, errores: 0, estado: "APLICADA", usuarioNombre: "Prueba",
      },
    });
    return db.movimientoBancario.create({
      data: { administradoraId: adm.id, condominioId: c.id, cuentaId: cuenta.id, importacionId: imp.id, fecha: dia(fecha), monto, huella: `m${n++}`, descripcion: descripcion ?? null },
    });
  };
  return { adm, c, u1, admin, oct, gasto, movimiento };
}

describe("FIN-COMP B · egresos, cargos y fondos", () => {
  test("un cargo se concilia con un egreso por pagar: queda pagado y el movimiento conciliado", async () => {
    const e = await escenario();
    const g = await e.gasto("Aseo octubre", 400000, { proveedor: "Aseo Ficticio Ltda." });
    const m = await e.movimiento("2026-11-03", -400000, "PAGO PROVEEDOR ASEO FICTICIO");
    const sug = await sugerenciasDeCargo(m);
    assert.equal(sug[0]?.gasto.id, g.id, "sugiere el egreso por monto y proveedor en la glosa");
    await conciliarCargoConEgreso(e.admin, { condominioId: e.c.id, movimientoId: m.id, gastoId: g.id });
    const g2 = await db.gasto.findUniqueOrThrow({ where: { id: g.id } });
    assert.equal(g2.estadoPago, "PAGADO");
    assert.equal(g2.fechaPago?.toISOString().slice(0, 10), "2026-11-03");
    const m2 = await db.movimientoBancario.findUniqueOrThrow({ where: { id: m.id } });
    assert.equal(Number(m2.montoConciliado), -400000, "lleva el signo del cargo");
    assert.equal(m2.estado, "CONCILIADO");
    // No se concilia dos veces.
    const otro = await e.movimiento("2026-11-04", -400000);
    await assert.rejects(conciliarCargoConEgreso(e.admin, { condominioId: e.c.id, movimientoId: otro.id, gastoId: g.id }), ErrorEgreso);
    // No se puede anular el pago mientras esté conciliado.
    await assert.rejects(anularPagoEgreso(e.admin, { condominioId: e.c.id, gastoId: g.id, motivo: "prueba de error" }), /Deshaz/);
    // Deshacer: el egreso sigue pagado y el cargo vuelve a pendiente.
    const conc = await db.conciliacionMovimiento.findFirstOrThrow({ where: { gastoId: g.id } });
    await deshacerConciliacion(e.admin, { condominioId: e.c.id, conciliacionId: conc.id, motivo: "Se eligió mal" });
    assert.equal((await db.gasto.findUniqueOrThrow({ where: { id: g.id } })).estadoPago, "PAGADO");
    const m3 = await db.movimientoBancario.findUniqueOrThrow({ where: { id: m.id } });
    assert.equal(Number(m3.montoConciliado), 0);
    assert.equal(m3.estado, "PENDIENTE");
  });

  test("un cargo paga varias facturas; no puede pasar de su monto; otro egreso; signos", async () => {
    const e = await escenario();
    const a = await e.gasto("Factura 1", 100000);
    const b = await e.gasto("Factura 2", 50000);
    const c3 = await e.gasto("Factura 3", 80000);
    const m = await e.movimiento("2026-11-05", -152000);
    await conciliarCargoConEgreso(e.admin, { condominioId: e.c.id, movimientoId: m.id, gastoId: a.id });
    await conciliarCargoConEgreso(e.admin, { condominioId: e.c.id, movimientoId: m.id, gastoId: b.id });
    assert.equal((await db.movimientoBancario.findUniqueOrThrow({ where: { id: m.id } })).estado, "REVISAR");
    await assert.rejects(conciliarCargoConEgreso(e.admin, { condominioId: e.c.id, movimientoId: m.id, gastoId: c3.id }), /solo tiene/);
    await registrarOtroEgreso(e.admin, { condominioId: e.c.id, movimientoId: m.id, monto: 2000, concepto: "Comisión transferencia" });
    assert.equal((await db.movimientoBancario.findUniqueOrThrow({ where: { id: m.id } })).estado, "CONCILIADO");
    // Un abono no sirve para un egreso, ni un cargo para el pago de una unidad.
    const abono = await e.movimiento("2026-11-06", 80000);
    await assert.rejects(conciliarCargoConEgreso(e.admin, { condominioId: e.c.id, movimientoId: abono.id, gastoId: c3.id }), /abono/);
    const cargo = await e.movimiento("2026-11-06", -80000);
    await assert.rejects(registrarIngresoDesdeMovimiento(e.admin, { condominioId: e.c.id, movimientoId: cargo.id, unidadId: e.u1.id, monto: 80000 }), /cargo/);
  });

  test("pago manual al proveedor y respaldos", async () => {
    const e = await escenario();
    const g = await e.gasto("Luz", 200000);
    await registrarPagoEgreso(e.admin, { condominioId: e.c.id, gastoId: g.id, fechaPago: dia("2026-11-02"), medioPago: "CHEQUE" });
    await assert.rejects(registrarPagoEgreso(e.admin, { condominioId: e.c.id, gastoId: g.id, fechaPago: dia("2026-11-02"), medioPago: "CHEQUE" }), /ya está pagado/);
    await anularPagoEgreso(e.admin, { condominioId: e.c.id, gastoId: g.id, motivo: "Se registró dos veces" });
    assert.equal((await db.gasto.findUniqueOrThrow({ where: { id: g.id } })).estadoPago, "POR_PAGAR");
    const pdf = Buffer.from("%PDF-1.4 factura ficticia");
    await subirRespaldo(e.admin, { condominioId: e.c.id, gastoId: g.id, nombre: "factura.pdf", archivo: pdf });
    await assert.rejects(subirRespaldo(e.admin, { condominioId: e.c.id, gastoId: g.id, nombre: "otra.pdf", archivo: pdf }), /ya está adjunto/);
    await assert.rejects(subirRespaldo(e.admin, { condominioId: e.c.id, gastoId: g.id, nombre: "x.exe", archivo: Buffer.from("MZ ejecutable") }), /PDF o una imagen/);
    assert.equal(await db.respaldoGasto.count({ where: { gastoId: g.id } }), 1);
  });

  test("fondos: el de reserva sale de los avisos, lo pagado con el fondo no se prorratea y no se retira más que el saldo", async () => {
    const e = await escenario();
    await e.gasto("Aseo", 200000);
    let saldos = await saldosFondos(e.c.id, e.adm.id);
    const reserva = saldos.find((s) => s.fondo.tipo === "RESERVA")!;
    assert.equal(reserva.saldo, 0);
    // Aporte manual y gasto pagado con el fondo en el mismo mes.
    await registrarMovimientoFondo(e.admin, { condominioId: e.c.id, fondoId: reserva.fondo.id, tipo: "APORTE", fecha: dia("2026-10-01"), monto: 500000, descripcion: "Saldo traspasado" });
    await e.gasto("Reparación bomba", 300000, { fondoId: reserva.fondo.id });
    await emitirPeriodo(e.oct.id, e.adm.id);
    const avisos = await db.avisoCobro.findMany({ where: { periodoId: e.oct.id } });
    assert.equal(avisos.reduce((s, a) => s + Number(a.gastoComun), 0), 200000, "solo se reparte lo que no paga el fondo");
    assert.equal(avisos.reduce((s, a) => s + Number(a.fondoReserva), 0), 20000);
    saldos = await saldosFondos(e.c.id, e.adm.id);
    assert.equal(saldos.find((s) => s.fondo.tipo === "RESERVA")!.saldo, 500000 + 20000 - 300000);
    await assert.rejects(
      registrarMovimientoFondo(e.admin, { condominioId: e.c.id, fondoId: reserva.fondo.id, tipo: "RETIRO", fecha: dia("2026-11-01"), monto: 300000, descripcion: "Retiro excesivo" }),
      /disponibles/,
    );
  });
});
