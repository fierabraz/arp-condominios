// RES-001 · Reserva de espacios comunes contra la base: turnos, aprobación y cobro en el aviso del mes.
// Solo contra una base de PRUEBA: npm run test:bd
import "dotenv/config";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { emitirPeriodo } from "../src/lib/cobro-servicio";
import {
  cancelarReserva,
  cargarCobrosPendientes,
  confirmarReserva,
  crearReserva,
  ErrorReserva,
  rechazarReserva,
} from "../src/lib/reservas-servicio";

if (/neon\.tech|vercel/i.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Estas pruebas crean y borran datos: no se ejecutan contra una base de Neon o Vercel.");
}

const creadas: string[] = [];
before(async () => {
  await db.$connect();
});
after(async () => {
  await db.administradora.deleteMany({ where: { id: { in: creadas } } });
  await db.$disconnect();
});

const HOY = "2026-11-06";

async function escenario(opciones: { estado?: "EN_CONFIGURACION" | "HABILITADA_ADMINISTRATIVA" | "HABILITADA_FINANCIERA"; requiereAprobacion?: boolean; costo?: number } = {}) {
  const adm = await db.administradora.create({ data: { nombre: `Prueba reservas ${Date.now()}-${Math.random()}` } });
  creadas.push(adm.id);
  const c = await db.condominio.create({
    data: {
      administradoraId: adm.id,
      nombre: "Comunidad Ficticia",
      direccion: "Calle 1",
      estado: opciones.estado ?? "HABILITADA_FINANCIERA",
      porcentajeReserva: 0,
    },
  });
  const u1 = await db.unidad.create({ data: { administradoraId: adm.id, condominioId: c.id, numero: "101", alicuota: 50 } });
  const u2 = await db.unidad.create({ data: { administradoraId: adm.id, condominioId: c.id, numero: "102", alicuota: 50 } });
  const quincho = await db.espacioReservable.create({
    data: {
      administradoraId: adm.id,
      condominioId: c.id,
      nombre: "Quincho",
      turnos: ["Almuerzo", "Noche"],
      costo: opciones.costo ?? 25000,
      requiereAprobacion: opciones.requiereAprobacion ?? false,
      anticipacionMaximaDias: 90,
    },
  });
  const reservar = (unidadId: string, dia: string, turno = "Noche", porAdministracion = false) =>
    crearReserva(adm.id, { espacioId: quincho.id, unidadId, dia, turno, solicitadaPor: "Residente Ficticio", porAdministracion, hoy: HOY });
  return { adm, c, u1, u2, quincho, reservar };
}

describe("reservas de espacios comunes (RES-001)", () => {
  test("reserva confirmada con costo: el cargo sale en el aviso del mes de la unidad", async () => {
    const { adm, c, u1, u2, reservar } = await escenario();
    const nov = await db.periodo.create({ data: { administradoraId: adm.id, condominioId: c.id, anio: 2026, mes: 11 } });
    await db.gasto.create({
      data: { administradoraId: adm.id, periodoId: nov.id, tipo: "COMUN", categoria: "Aseo", descripcion: "Aseo", monto: 200000, fecha: new Date("2026-11-02") },
    });
    const { reserva, periodo } = await reservar(u1.id, "2026-11-20");
    assert.equal(reserva.estado, "CONFIRMADA");
    assert.equal(periodo?.id, nov.id);
    const r = await db.reserva.findUniqueOrThrow({ where: { id: reserva.id }, include: { gasto: true } });
    assert.equal(r.cobro, "CARGADO");
    assert.equal(r.gasto?.tipo, "INDIVIDUAL");
    assert.equal(r.gasto?.unidadId, u1.id);
    assert.equal(Number(r.gasto?.monto), 25000);

    await emitirPeriodo(nov.id, adm.id);
    const a1 = await db.avisoCobro.findUniqueOrThrow({ where: { periodoId_unidadId: { periodoId: nov.id, unidadId: u1.id } } });
    const a2 = await db.avisoCobro.findUniqueOrThrow({ where: { periodoId_unidadId: { periodoId: nov.id, unidadId: u2.id } } });
    assert.equal(Number(a1.cargos), 25000);
    assert.equal(Number(a1.total), 125000);
    // La otra unidad paga solo su parte del gasto común: el quincho no se reparte.
    assert.equal(Number(a2.cargos), 0);
    assert.equal(Number(a2.total), 100000);
  });

  test("el mismo turno no se puede reservar dos veces, ni aunque lleguen al mismo tiempo", async () => {
    const { u1, u2, reservar } = await escenario({ costo: 0 });
    const resultados = await Promise.allSettled([reservar(u1.id, "2026-11-21"), reservar(u2.id, "2026-11-21")]);
    assert.equal(resultados.filter((r) => r.status === "fulfilled").length, 1);
    const fallida = resultados.find((r) => r.status === "rejected") as PromiseRejectedResult;
    assert.ok(fallida.reason instanceof ErrorReserva);
    assert.match(fallida.reason.message, /ya está reservado/);
    // El otro turno del mismo día sigue libre.
    await reservar(u2.id, "2026-11-21", "Almuerzo");
  });

  test("sin mes abierto, el cargo queda por cargar y se agrega al abrir el mes", async () => {
    const { adm, c, u1, reservar } = await escenario();
    const { reserva, periodo } = await reservar(u1.id, "2026-12-12");
    assert.equal(periodo, null);
    assert.equal((await db.reserva.findUniqueOrThrow({ where: { id: reserva.id } })).cobro, "POR_CARGAR");
    // Abrir noviembre no sirve: la reserva es de diciembre.
    await db.periodo.create({ data: { administradoraId: adm.id, condominioId: c.id, anio: 2026, mes: 11 } });
    assert.equal(await cargarCobrosPendientes(c.id, adm.id), 0);
    const dic = await db.periodo.create({ data: { administradoraId: adm.id, condominioId: c.id, anio: 2026, mes: 12 } });
    assert.equal(await cargarCobrosPendientes(c.id, adm.id), 1);
    const r = await db.reserva.findUniqueOrThrow({ where: { id: reserva.id }, include: { gasto: true } });
    assert.equal(r.cobro, "CARGADO");
    assert.equal(r.gasto?.periodoId, dic.id);
    // Volver a revisar no duplica el cargo.
    assert.equal(await cargarCobrosPendientes(c.id, adm.id), 0);
    assert.equal(await db.gasto.count({ where: { unidadId: u1.id } }), 1);
  });

  test("con aprobación: por aprobar no cobra; al aprobar se carga; al rechazar se libera el turno", async () => {
    const { adm, c, u1, u2, reservar } = await escenario({ requiereAprobacion: true });
    await db.periodo.create({ data: { administradoraId: adm.id, condominioId: c.id, anio: 2026, mes: 11 } });
    const a = await reservar(u1.id, "2026-11-27");
    assert.equal(a.reserva.estado, "PENDIENTE");
    assert.equal(await db.gasto.count({ where: { unidadId: u1.id } }), 0);
    // Mientras espera aprobación, el turno está tomado.
    await assert.rejects(reservar(u2.id, "2026-11-27"), /ya está reservado/);
    await confirmarReserva(a.reserva.id, adm.id, "Administración");
    assert.equal(await db.gasto.count({ where: { unidadId: u1.id } }), 1);
    await assert.rejects(confirmarReserva(a.reserva.id, adm.id, "Administración"), /ya fue respondida/);

    const b = await reservar(u2.id, "2026-11-28");
    await rechazarReserva(b.reserva.id, adm.id, "Administración", "Mantención");
    const rb = await db.reserva.findUniqueOrThrow({ where: { id: b.reserva.id } });
    assert.equal(rb.estado, "RECHAZADA");
    assert.equal(rb.cobro, "ANULADO");
    assert.equal(await db.gasto.count({ where: { unidadId: u2.id } }), 0);
    await reservar(u1.id, "2026-11-28");
  });

  test("cancelar: con el mes abierto se quita el cargo; con el aviso emitido se mantiene", async () => {
    const { adm, c, u1, reservar } = await escenario();
    const nov = await db.periodo.create({ data: { administradoraId: adm.id, condominioId: c.id, anio: 2026, mes: 11 } });
    const a = await reservar(u1.id, "2026-11-13");
    const ca = await cancelarReserva(a.reserva.id, adm.id, { por: "Residente", porAdministracion: false, hoy: HOY, unidadesPermitidas: [u1.id] });
    assert.equal(ca.cargoQuitado, true);
    assert.equal(await db.gasto.count({ where: { unidadId: u1.id } }), 0);
    assert.equal((await db.reserva.findUniqueOrThrow({ where: { id: a.reserva.id } })).cobro, "ANULADO");

    const b = await reservar(u1.id, "2026-11-14");
    await emitirPeriodo(nov.id, adm.id);
    // El residente ya no puede cancelarla: el cobro salió en su aviso.
    await assert.rejects(
      cancelarReserva(b.reserva.id, adm.id, { por: "Residente", porAdministracion: false, hoy: HOY, unidadesPermitidas: [u1.id] }),
      /contacta a la administración/,
    );
    const cb = await cancelarReserva(b.reserva.id, adm.id, { por: "Administración", motivo: "Lluvia", porAdministracion: true, hoy: HOY });
    assert.equal(cb.cargoSeMantiene, true);
    assert.equal(await db.gasto.count({ where: { unidadId: u1.id } }), 1);
    const aviso = await db.avisoCobro.findUniqueOrThrow({ where: { periodoId_unidadId: { periodoId: nov.id, unidadId: u1.id } } });
    assert.equal(Number(aviso.cargos), 25000);
  });

  test("un residente no cancela reservas de otra unidad", async () => {
    const { adm, u1, u2, reservar } = await escenario({ costo: 0 });
    const a = await reservar(u1.id, "2026-11-19");
    await assert.rejects(
      cancelarReserva(a.reserva.id, adm.id, { por: "Otro", porAdministracion: false, hoy: HOY, unidadesPermitidas: [u2.id] }),
      /no encontrada/,
    );
  });

  test("comunidad en configuración, unidad de otra comunidad y espacio de otra administradora: no se reserva", async () => {
    const enConfig = await escenario({ estado: "EN_CONFIGURACION" });
    await assert.rejects(enConfig.reservar(enConfig.u1.id, "2026-11-20"), /en configuración/);

    const a = await escenario({ costo: 0 });
    const b = await escenario({ costo: 0 });
    await assert.rejects(a.reservar(b.u1.id, "2026-11-20"), /Unidad no encontrada/);
    await assert.rejects(
      crearReserva(a.adm.id, { espacioId: b.quincho.id, unidadId: b.u1.id, dia: "2026-11-20", turno: "Noche", solicitadaPor: "X", porAdministracion: true, hoy: HOY }),
      /Espacio no encontrado/,
    );
  });

  test("bloquear morosos: con un cobro vencido sin pagar no deja reservar", async () => {
    const { adm, c, u1, quincho, reservar } = await escenario({ costo: 0 });
    await db.espacioReservable.update({ where: { id: quincho.id }, data: { bloquearMorosos: true } });
    const oct = await db.periodo.create({ data: { administradoraId: adm.id, condominioId: c.id, anio: 2026, mes: 10, estado: "CERRADO" } });
    await db.avisoCobro.create({
      data: { administradoraId: adm.id, periodoId: oct.id, unidadId: u1.id, gastoComun: 1000, fondoReserva: 0, cargos: 0, total: 1000, saldo: 1000, vencimiento: new Date("2026-10-10") },
    });
    await assert.rejects(reservar(u1.id, "2026-11-20"), /cobros vencidos/);
    // La administración sí puede reservar a su nombre.
    await reservar(u1.id, "2026-11-20", "Noche", true);
  });
});
