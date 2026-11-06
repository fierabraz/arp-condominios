// COM-001 · Entrega 5: apertura financiera contra la base. Solo contra una base de PRUEBA: npm run test:bd
import "dotenv/config";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { datosApertura } from "../src/lib/apertura-servicio";
import { historialUnidad } from "../src/lib/unidades";

if (/neon\.tech|vercel/i.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Estas pruebas crean y borran datos: no se ejecutan contra una base de Neon o Vercel.");
}

const creadas: string[] = [];
before(async () => {
  await db.$connect();
});
after(async () => {
  for (const id of creadas) await db.administradora.delete({ where: { id } });
  await db.$disconnect();
});

describe("apertura financiera (COM-001 · Entrega 5)", () => {
  test("caso A-305: tres deudas desglosadas, sin duplicar la misma unidad, mes y concepto", async () => {
    const adm = await db.administradora.create({ data: { nombre: `Prueba apertura ${Date.now()}` } });
    creadas.push(adm.id);
    const c = await db.condominio.create({ data: { administradoraId: adm.id, nombre: "Comunidad Ficticia", direccion: "Calle 5", modalidad: "EXISTENTE" } });
    const u = await db.unidad.create({ data: { administradoraId: adm.id, condominioId: c.id, numero: "A-305", alicuota: 100 } });
    const ap = await db.apertura.create({ data: { administradoraId: adm.id, condominioId: c.id, fechaCorte: new Date("2026-11-30"), preparadoPor: "Prueba" } });
    const deuda = (periodo: string, saldo: number) => ({ aperturaId: ap.id, unidadId: u.id, periodo, concepto: "Gasto común", saldo, creadoPor: "Prueba" });
    await db.deudaApertura.createMany({ data: [deuda("2026-09", 65000), deuda("2026-10", 72000), deuda("2026-11", 75000)] });
    await assert.rejects(db.deudaApertura.create({ data: deuda("2026-09", 65000) }), /Unique constraint/);
    await db.fondoApertura.create({ data: { aperturaId: ap.id, tipo: "RESERVA", nombre: "Reserva", saldoContable: 500000, creadoPor: "Prueba" } });
    await db.cuentaApertura.create({ data: { aperturaId: ap.id, tipo: "CORRIENTE", banco: "Banco Ficticio", saldoCartola: 520000, chequesNoCobrados: 20000, creadoPor: "Prueba" } });

    const { resumen } = await datosApertura(ap.id);
    assert.equal(resumen.deudas.total, 212000);
    assert.equal(resumen.deudas.cantidad, 3);
    assert.equal(resumen.cuadre.nivel, "cuadra");
    // Una unidad con saldos de apertura es historial: no se puede borrar desde la app.
    assert.equal((await historialUnidad(u.id)).apertura, 3);
    // La apertura es única por comunidad.
    await assert.rejects(db.apertura.create({ data: { administradoraId: adm.id, condominioId: c.id, fechaCorte: new Date("2026-10-31"), preparadoPor: "Prueba" } }), /Unique constraint/);
    // Nada de esto toca cobros: no se creó ningún período ni aviso.
    assert.equal(await db.avisoCobro.count({ where: { unidadId: u.id } }), 0);
  });
});
