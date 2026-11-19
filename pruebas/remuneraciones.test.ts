// FIN-COMP · Entrega D · Remuneraciones básicas (datos ficticios). Solo contra una base de PRUEBA.
import "dotenv/config";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { cargarRemuneraciones, ErrorRemuneracion } from "../src/lib/remuneraciones-servicio";
import { emitirPeriodo } from "../src/lib/cobro-servicio";

if (/neon\.tech|vercel/i.test(process.env.DATABASE_URL ?? "")) throw new Error("No se ejecuta contra Neon o Vercel.");

const creadas: string[] = [];
before(() => db.$connect());
after(async () => {
  for (const id of creadas) {
    await db.registroCambio.deleteMany({ where: { administradoraId: id } });
    await db.avisoCobro.deleteMany({ where: { administradoraId: id } });
    await db.gasto.deleteMany({ where: { administradoraId: id } });
    await db.trabajador.deleteMany({ where: { administradoraId: id } });
    await db.fondo.deleteMany({ where: { administradoraId: id } });
    await db.administradora.delete({ where: { id } });
  }
  await db.$disconnect();
});

test("carga sueldo e imposiciones de los activos una sola vez, solo con el mes abierto, y entran al prorrateo", async () => {
  const adm = await db.administradora.create({ data: { nombre: `Prueba remuneraciones ${Date.now()}` } });
  creadas.push(adm.id);
  const c = await db.condominio.create({ data: { administradoraId: adm.id, nombre: "Ficticia", direccion: "Calle 1", estado: "HABILITADA_FINANCIERA", porcentajeReserva: 0 } });
  await db.unidad.create({ data: { administradoraId: adm.id, condominioId: c.id, numero: "101", alicuota: 100 } });
  const base = { administradoraId: adm.id, condominioId: c.id, creadoPor: "Prueba" };
  await db.trabajador.create({ data: { ...base, nombre: "Conserje Ficticio", cargo: "Conserje", liquido: 650000, imposiciones: 180000 } });
  await db.trabajador.create({ data: { ...base, nombre: "Aseo Ficticio", cargo: "Aseo", liquido: 500000 } });
  await db.trabajador.create({ data: { ...base, nombre: "De Baja", cargo: "Jardín", liquido: 300000, activo: false } });
  await assert.rejects(db.trabajador.create({ data: { ...base, nombre: "X", cargo: "Y", liquido: 0 } })); // CHECK de la base
  const autor = { id: "a", nombre: "Administradora Ficticia", administradoraId: adm.id };
  const p = await db.periodo.create({ data: { administradoraId: adm.id, condominioId: c.id, anio: 2026, mes: 10 } });

  const r = await cargarRemuneraciones(autor, p.id);
  assert.equal(r.cargados, 2);
  assert.equal(r.total, 1330000);
  const gastos = await db.gasto.findMany({ where: { periodoId: p.id } });
  assert.equal(gastos.length, 3);
  assert.ok(gastos.every((g) => g.estadoPago === "POR_PAGAR" && g.categoria === "Remuneraciones" && g.fecha.toISOString().startsWith("2026-10-31")));
  await assert.rejects(cargarRemuneraciones(autor, p.id), (e: Error) => e instanceof ErrorRemuneracion && /ya estaban cargadas/.test(e.message));

  await emitirPeriodo(p.id, adm.id);
  const aviso = await db.avisoCobro.findFirstOrThrow({ where: { periodoId: p.id } });
  assert.equal(Number(aviso.gastoComun), 1330000);
  await assert.rejects(cargarRemuneraciones(autor, p.id), /mes abierto/);
});
