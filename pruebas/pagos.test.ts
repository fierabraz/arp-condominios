// PAG-001 · Transferencias informadas contra la base: informar no cambia la deuda; confirmar con la
// cartola crea UN pago y concilia el movimiento; anular el pago lo deshace todo.
// Solo contra una base de PRUEBA: npm run test:bd
import "dotenv/config";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { anularPago, emitirPeriodo, estadoCuenta } from "../src/lib/cobro-servicio";
import {
  cambiarEstadoTransferencia,
  confirmarTransferencia,
  cuentaParaPagos,
  ErrorTransferencia,
  informarTransferencia,
  TransferenciaRepetida,
} from "../src/lib/transferencias-servicio";
import type { UsuarioActual } from "../src/lib/auth";

if (/neon\.tech|vercel/i.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Estas pruebas crean y borran datos: no se ejecutan contra una base de Neon o Vercel.");
}

const creadas: string[] = [];
before(async () => {
  await db.$connect();
});
after(async () => {
  for (const id of creadas) {
    await db.transferenciaInformada.deleteMany({ where: { administradoraId: id } });
    await db.movimientoBancario.deleteMany({ where: { administradoraId: id } });
    await db.importacionCartola.deleteMany({ where: { administradoraId: id } });
    await db.administradora.delete({ where: { id } });
  }
  await db.$disconnect();
});

const dia = (s: string) => new Date(`${s}T00:00:00Z`);

async function escenario() {
  const adm = await db.administradora.create({ data: { nombre: `Prueba pagos ${Date.now()}-${Math.random()}` } });
  creadas.push(adm.id);
  const c = await db.condominio.create({
    data: { administradoraId: adm.id, nombre: "Comunidad Ficticia", direccion: "Calle 1", estado: "HABILITADA_FINANCIERA", porcentajeReserva: 0 },
  });
  const u1 = await db.unidad.create({ data: { administradoraId: adm.id, condominioId: c.id, numero: "101", alicuota: 50 } });
  const u2 = await db.unidad.create({ data: { administradoraId: adm.id, condominioId: c.id, numero: "102", alicuota: 50 } });
  const persona = await db.persona.create({ data: { administradoraId: adm.id, nombre: "Residente Ficticia" } });
  await db.unidadPersona.create({ data: { unidadId: u1.id, personaId: persona.id, relacion: "RESIDENTE" } });
  const fila = await db.usuario.create({
    data: { administradoraId: adm.id, nombre: "Residente Ficticia", correo: `r-${adm.id}@prueba.cl`, claveHash: "x", rol: "RESIDENTE", personaId: persona.id },
  });
  const residente: UsuarioActual = {
    id: fila.id,
    nombre: fila.nombre,
    correo: fila.correo,
    rol: "RESIDENTE",
    administradoraId: adm.id,
    condominioId: null,
    personaId: persona.id,
    accesoTodas: false,
    asignados: [],
    administradora: { nombre: adm.nombre, moneda: "CLP" },
  };
  const admin = { id: "admin-prueba", nombre: "Administradora Ficticia", administradoraId: adm.id };
  const periodo = await db.periodo.create({ data: { administradoraId: adm.id, condominioId: c.id, anio: 2026, mes: 10 } });
  await db.gasto.create({
    data: { administradoraId: adm.id, periodoId: periodo.id, tipo: "COMUN", categoria: "Aseo", descripcion: "Aseo", monto: 200000, fecha: dia("2026-10-15") },
  });
  await emitirPeriodo(periodo.id, adm.id);
  const aviso = await db.avisoCobro.findFirstOrThrow({ where: { unidadId: u1.id } });
  const cuenta = await db.cuentaBancaria.create({
    data: {
      administradoraId: adm.id,
      condominioId: c.id,
      banco: "Banco de Chile",
      tipo: "CORRIENTE",
      numeroFinal: "4321",
      numeroCuenta: "0012344321",
      titular: "Comunidad Ficticia",
      rutTitular: "760864285",
      recibePagos: true,
      verificadaEn: new Date(),
      verificadaPor: "Prueba",
      creadoPor: "Prueba",
    },
  });
  const importacion = await db.importacionCartola.create({
    data: {
      administradoraId: adm.id,
      condominioId: c.id,
      cuentaId: cuenta.id,
      banco: cuenta.banco,
      archivoNombre: "cartola.csv",
      archivoHuella: "h",
      archivoTamano: 1,
      formato: "CSV",
      encontrados: 0,
      nuevos: 0,
      yaRegistrados: 0,
      posiblesDuplicados: 0,
      duplicadosOmitidos: 0,
      errores: 0,
      estado: "APLICADA",
      usuarioNombre: "Prueba",
    },
  });
  let n = 0;
  const movimiento = (fecha: string, monto: number) =>
    db.movimientoBancario.create({
      data: { administradoraId: adm.id, condominioId: c.id, cuentaId: cuenta.id, importacionId: importacion.id, fecha: dia(fecha), monto, huella: `m${n++}` },
    });
  const informar = (datos: Partial<Parameters<typeof informarTransferencia>[1]> = {}, comprobante: Buffer | null = null, confirmar = false) =>
    informarTransferencia(
      residente,
      { unidadId: u1.id, fecha: dia("2026-11-05"), monto: 60000, ...datos },
      comprobante ? { nombre: "comprobante.pdf", datos: comprobante } : null,
      confirmar,
    );
  return { adm, c, u1, u2, residente, admin, aviso, cuenta, movimiento, informar };
}

describe("PAG-001 · transferencias informadas", () => {
  test("la cuenta publicada es la completa, marcada y verificada", async () => {
    const e = await escenario();
    assert.equal((await cuentaParaPagos(e.c.id, e.adm.id))?.id, e.cuenta.id);
    await db.cuentaBancaria.update({ where: { id: e.cuenta.id }, data: { verificadaEn: null } });
    assert.equal(await cuentaParaPagos(e.c.id, e.adm.id), null);
  });

  test("informar NO cambia la deuda ni crea pagos; avisa si se repite", async () => {
    const e = await escenario();
    const t = await e.informar({ avisoId: e.aviso.id, operacion: "778899" }, Buffer.from("%PDF-1.4 comprobante ficticio"));
    assert.equal(t.estado, "INFORMADA");
    assert.equal(Number(t.deudaAlInformar), 100000);
    const estado = await estadoCuenta(e.u1.id, e.adm.id);
    assert.equal(estado!.deuda, 100000);
    assert.equal(estado!.pagos.length, 0);

    await assert.rejects(e.informar(), TransferenciaRepetida); // mismo monto y fecha
    await assert.rejects(e.informar({ fecha: dia("2026-11-06"), operacion: "778899" }), TransferenciaRepetida); // misma operación
    await assert.rejects(e.informar({ fecha: dia("2026-11-07") }, Buffer.from("%PDF-1.4 comprobante ficticio")), TransferenciaRepetida); // mismo archivo
    // Confirmando que es otra, se guarda (y sigue sin tocar la deuda).
    await e.informar({}, null, true);
    assert.equal(await db.transferenciaInformada.count({ where: { unidadId: e.u1.id } }), 2);
    assert.equal((await estadoCuenta(e.u1.id, e.adm.id))!.deuda, 100000);
  });

  test("no se puede informar por una unidad ajena", async () => {
    const e = await escenario();
    await assert.rejects(e.informar({ unidadId: e.u2.id }), ErrorTransferencia);
  });

  test("confirmar con la cartola crea UN pago, concilia el movimiento y no se repite", async () => {
    const e = await escenario();
    const t = await e.informar();
    const m = await e.movimiento("2026-11-05", 60000);
    const { pagoId } = await confirmarTransferencia(e.admin, { transferenciaId: t.id, movimientoId: m.id, monto: 60000 });

    const pagos = await db.pago.findMany({ where: { unidadId: e.u1.id } });
    assert.equal(pagos.length, 1);
    assert.equal(pagos[0].id, pagoId);
    assert.equal(pagos[0].medio, "TRANSFERENCIA");
    assert.equal((await db.avisoCobro.findUniqueOrThrow({ where: { id: e.aviso.id } })).saldo.toString(), "40000");
    const mv = await db.movimientoBancario.findUniqueOrThrow({ where: { id: m.id } });
    assert.equal(mv.estado, "CONCILIADO");
    assert.equal(Number(mv.montoConciliado), 60000);
    const tt = await db.transferenciaInformada.findUniqueOrThrow({ where: { id: t.id } });
    assert.equal(tt.estado, "CONCILIADA");
    assert.equal(tt.movimientoId, m.id);
    assert.equal(tt.pagoId, pagoId);
    assert.equal(await db.registroCambio.count({ where: { entidad: "TransferenciaInformada", entidadId: t.id } }), 2);

    // No se confirma dos veces, ni otra transferencia con el mismo movimiento ya usado.
    await assert.rejects(confirmarTransferencia(e.admin, { transferenciaId: t.id, movimientoId: m.id, monto: 60000 }), ErrorTransferencia);
    const t2 = await e.informar({ fecha: dia("2026-11-06") });
    await assert.rejects(confirmarTransferencia(e.admin, { transferenciaId: t2.id, movimientoId: m.id, monto: 60000 }), /sin conciliar/);
    assert.equal(await db.pago.count({ where: { unidadId: e.u1.id } }), 1);
    // Ya conciliada, no se puede rechazar (se deshace anulando el pago).
    await assert.rejects(cambiarEstadoTransferencia(e.admin, { transferenciaId: t.id, estado: "RECHAZADA", nota: "Prueba de rechazo" }), ErrorTransferencia);
  });

  test("un movimiento mayor se concilia en parte; un pago mayor deja saldo a favor verificado", async () => {
    const e = await escenario();
    const m = await e.movimiento("2026-11-05", 150000);
    const t = await e.informar({ monto: 150000 });
    await confirmarTransferencia(e.admin, { transferenciaId: t.id, movimientoId: m.id, monto: 120000 });
    const mv = await db.movimientoBancario.findUniqueOrThrow({ where: { id: m.id } });
    assert.equal(mv.estado, "REVISAR");
    assert.equal(Number(mv.montoConciliado), 120000);
    const estado = await estadoCuenta(e.u1.id, e.adm.id);
    assert.equal(estado!.deuda, 0);
    assert.equal(estado!.aFavor, 20000);
    assert.match((await db.transferenciaInformada.findUniqueOrThrow({ where: { id: t.id } })).nota ?? "", /informó/);
  });

  test("anular el pago devuelve la deuda, libera el movimiento y deja la transferencia en revisión", async () => {
    const e = await escenario();
    const t = await e.informar();
    const m = await e.movimiento("2026-11-04", 60000);
    const { pagoId } = await confirmarTransferencia(e.admin, { transferenciaId: t.id, movimientoId: m.id, monto: 60000 });
    await anularPago(pagoId, e.adm.id, { por: "Administradora Ficticia", motivo: "Se confirmó con el movimiento equivocado" });
    assert.equal((await estadoCuenta(e.u1.id, e.adm.id))!.deuda, 100000);
    const mv = await db.movimientoBancario.findUniqueOrThrow({ where: { id: m.id } });
    assert.equal(mv.estado, "PENDIENTE");
    assert.equal(Number(mv.montoConciliado), 0);
    const tt = await db.transferenciaInformada.findUniqueOrThrow({ where: { id: t.id } });
    assert.equal(tt.estado, "EN_REVISION");
    assert.equal(tt.pagoId, null);
    assert.equal(tt.movimientoId, null);
    // Y se puede volver a confirmar con el movimiento correcto.
    await confirmarTransferencia(e.admin, { transferenciaId: t.id, movimientoId: m.id, monto: 60000 });
    assert.equal((await estadoCuenta(e.u1.id, e.adm.id))!.deuda, 40000);
  });

  test("rechazar guarda el motivo y no toca la deuda", async () => {
    const e = await escenario();
    const t = await e.informar();
    await cambiarEstadoTransferencia(e.admin, { transferenciaId: t.id, estado: "RECHAZADA", nota: "No aparece en la cartola de noviembre" });
    const tt = await db.transferenciaInformada.findUniqueOrThrow({ where: { id: t.id } });
    assert.equal(tt.estado, "RECHAZADA");
    assert.equal(tt.revisadoPor, "Administradora Ficticia");
    assert.equal((await estadoCuenta(e.u1.id, e.adm.id))!.deuda, 100000);
  });

  test("los avisos tienen un código de pago aleatorio y distinto", async () => {
    const e = await escenario();
    const codigos = (await db.avisoCobro.findMany({ where: { periodo: { condominioId: e.c.id } }, select: { codigoPago: true } })).map((a) => a.codigoPago);
    assert.equal(codigos.length, 2);
    assert.notEqual(codigos[0], codigos[1]);
    for (const c of codigos) assert.match(c, /^[0-9a-f]{32}$/);
  });
});
