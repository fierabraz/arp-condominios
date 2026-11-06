// PLA-002 · Cupo de comunidades por plan, contra la base. Solo contra una base de PRUEBA: npm run test:bd
import "dotenv/config";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { crearDentroDelCupo, cupoDe, SinCupoError } from "../src/lib/planes-servicio";

if (/neon\.tech|vercel/i.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Estas pruebas crean y borran datos: no se ejecutan contra una base de Neon o Vercel.");
}

const creadas: string[] = [];
const planes: string[] = [];
before(async () => {
  await db.$connect();
});
after(async () => {
  await db.administradora.deleteMany({ where: { id: { in: creadas } } });
  await db.plan.deleteMany({ where: { id: { in: planes } } });
  await db.$disconnect();
});

async function administradora(maxComunidades: number | null, creaComunidades = true) {
  const plan = await db.plan.create({ data: { nombre: `Plan prueba ${Date.now()}-${Math.random()}`, maxComunidades } });
  planes.push(plan.id);
  const adm = await db.administradora.create({ data: { nombre: `Prueba planes ${Math.random()}`, planId: plan.id, creaComunidades } });
  creadas.push(adm.id);
  return adm.id;
}

const nueva = (administradoraId: string, n: number) =>
  crearDentroDelCupo(administradoraId, (tx) =>
    tx.condominio.create({ data: { administradoraId, nombre: `Comunidad ficticia ${n}`, direccion: "Calle 1" } }),
  );

test("los planes iniciales vienen en la migración", async () => {
  const nombres = (await db.plan.findMany({ where: { id: { startsWith: "plan_" } }, orderBy: { orden: "asc" } })).map((p) => p.nombre);
  assert.deepEqual(nombres, ["Esencial", "Esencial Pro", "Gestión", "Gestión Pro", "Integral", "Ultra"]);
});

test("crea hasta el límite y después se detiene", async () => {
  const id = await administradora(2);
  await nueva(id, 1);
  await nueva(id, 2);
  await assert.rejects(nueva(id, 3), SinCupoError);
  assert.equal(await db.condominio.count({ where: { administradoraId: id } }), 2);
  const cupo = await cupoDe(id);
  assert.equal(cupo.puede, false);
  assert.equal(cupo.usadas, 2);
});

test("dos creaciones al mismo tiempo no se pasan del límite", async () => {
  const id = await administradora(1);
  const resultados = await Promise.allSettled([nueva(id, 1), nueva(id, 2), nueva(id, 3)]);
  assert.equal(resultados.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await db.condominio.count({ where: { administradoraId: id } }), 1);
});

test("sin la facultad no crea aunque haya cupo", async () => {
  const id = await administradora(10, false);
  await assert.rejects(nueva(id, 1), SinCupoError);
});

test("sin plan no hay límite (como antes)", async () => {
  const adm = await db.administradora.create({ data: { nombre: `Prueba sin plan ${Math.random()}` } });
  creadas.push(adm.id);
  for (let i = 0; i < 3; i++) await nueva(adm.id, i);
  assert.equal((await cupoDe(adm.id)).puede, true);
});

test("borrar un plan deja a sus administradoras sin plan, sin borrar comunidades", async () => {
  const id = await administradora(1);
  await nueva(id, 1);
  const a = await db.administradora.findUniqueOrThrow({ where: { id } });
  await db.plan.delete({ where: { id: a.planId! } });
  assert.equal((await db.administradora.findUniqueOrThrow({ where: { id } })).planId, null);
  assert.equal(await db.condominio.count({ where: { administradoraId: id } }), 1);
});
