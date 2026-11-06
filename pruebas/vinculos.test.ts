// COM-001 · Entrega 3: el historial de vínculos manda y UnidadPersona (la foto de hoy) lo sigue.
// Solo contra una base de PRUEBA: npm run test:bd
import "dotenv/config";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { crearVinculo, terminarVinculo } from "../src/lib/vinculos-servicio";

if (/neon\.tech|vercel/i.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Estas pruebas crean y borran datos: no se ejecutan contra una base de Neon o Vercel.");
}

const creadas: string[] = [];
before(async () => {
  await db.$connect();
});
after(async () => {
  for (const id of creadas) {
    await db.vinculoUnidad.deleteMany({ where: { administradoraId: id } });
    await db.administradora.delete({ where: { id } });
  }
  await db.$disconnect();
});

async function datos() {
  const adm = await db.administradora.create({ data: { nombre: `Prueba vínculos ${Date.now()}-${Math.random()}` } });
  creadas.push(adm.id);
  const c = await db.condominio.create({ data: { administradoraId: adm.id, nombre: "Condominio Ficticio", direccion: "Calle 2" } });
  const u = await db.unidad.create({ data: { administradoraId: adm.id, condominioId: c.id, numero: "11", alicuota: 100 } });
  const [ana, luis] = await Promise.all(
    ["Ana Ficticia", "Luis Ficticio"].map((nombre) => db.persona.create({ data: { administradoraId: adm.id, nombre } })),
  );
  const base = { administradoraId: adm.id, unidadId: u.id, desde: new Date("2026-01-01"), creadoPor: "Prueba" };
  return { u, ana, luis, base };
}
const relaciones = (unidadId: string, personaId: string) =>
  db.unidadPersona.findMany({ where: { unidadId, personaId }, select: { relacion: true } }).then((r) => r.map((x) => x.relacion).sort());

describe("vínculos con historial (COM-001)", () => {
  test("arrendar, terminar y comprar: la foto de hoy sigue al historial y nada se borra", async () => {
    const { u, ana, luis, base } = await datos();
    assert.equal(await db.$transaction((tx) => crearVinculo(tx, { ...base, personaId: ana.id, tipo: "PROPIETARIO" })), null);
    assert.equal(await db.$transaction((tx) => crearVinculo(tx, { ...base, personaId: luis.id, tipo: "ARRENDATARIO" })), null);
    assert.deepEqual(await relaciones(u.id, luis.id), ["RESIDENTE"]);
    // Luis no puede quedar como propietario mientras Ana lo es ni mientras arrienda.
    assert.match((await db.$transaction((tx) => crearVinculo(tx, { ...base, personaId: luis.id, tipo: "PROPIETARIO" })))!, /termina el arriendo/);

    const arriendo = await db.vinculoUnidad.findFirstOrThrow({ where: { unidadId: u.id, personaId: luis.id } });
    assert.equal(await db.$transaction((tx) => terminarVinculo(tx, arriendo.id, new Date("2026-06-30"), "Prueba")), null);
    assert.deepEqual(await relaciones(u.id, luis.id), []);
    assert.match((await db.$transaction((tx) => terminarVinculo(tx, arriendo.id, new Date("2026-07-01"), "Prueba")))!, /ya terminó/);

    const venta = await db.vinculoUnidad.findFirstOrThrow({ where: { unidadId: u.id, personaId: ana.id } });
    await db.$transaction((tx) => terminarVinculo(tx, venta.id, new Date("2026-07-01"), "Prueba"));
    assert.equal(await db.$transaction((tx) => crearVinculo(tx, { ...base, desde: new Date("2026-07-01"), personaId: luis.id, tipo: "PROPIETARIO" })), null);
    assert.deepEqual(await relaciones(u.id, luis.id), ["PROPIETARIO"]);
    assert.deepEqual(await relaciones(u.id, ana.id), []);
    assert.equal(await db.vinculoUnidad.count({ where: { unidadId: u.id } }), 3);
  });

  test("un ocupante queda registrado sin acceso; si también es residente, terminar uno no quita el otro", async () => {
    const { u, ana, base } = await datos();
    await db.$transaction((tx) => crearVinculo(tx, { ...base, personaId: ana.id, tipo: "OCUPANTE" }));
    assert.deepEqual(await relaciones(u.id, ana.id), []);
    await db.$transaction((tx) => crearVinculo(tx, { ...base, personaId: ana.id, tipo: "PROPIETARIO" }));
    await db.$transaction((tx) => crearVinculo(tx, { ...base, personaId: ana.id, tipo: "RESIDENTE" }));
    assert.deepEqual(await relaciones(u.id, ana.id), ["PROPIETARIO", "RESIDENTE"]);
    const res = await db.vinculoUnidad.findFirstOrThrow({ where: { unidadId: u.id, personaId: ana.id, tipo: "RESIDENTE" } });
    await db.$transaction((tx) => terminarVinculo(tx, res.id, new Date("2026-03-01"), "Prueba"));
    assert.deepEqual(await relaciones(u.id, ana.id), ["PROPIETARIO"]);
  });

  test("una persona con historial no se puede borrar de la base", async () => {
    const { ana, base } = await datos();
    await db.$transaction((tx) => crearVinculo(tx, { ...base, personaId: ana.id, tipo: "RESIDENTE" }));
    await assert.rejects(db.persona.delete({ where: { id: ana.id } }));
  });

  test("dos propietarios guardados a la vez: solo entra uno", async () => {
    const { u, ana, luis, base } = await datos();
    const r = await Promise.all([ana, luis].map((p) => db.$transaction((tx) => crearVinculo(tx, { ...base, personaId: p.id, tipo: "PROPIETARIO" }))));
    assert.equal(r.filter((x) => x === null).length, 1);
    assert.equal(await db.vinculoUnidad.count({ where: { unidadId: u.id, tipo: "PROPIETARIO" } }), 1);
  });
});
