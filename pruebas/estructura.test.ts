// COM-001 · Entrega 2: reglas de la base para la estructura física. Solo contra una base de PRUEBA: npm run test:bd
import "dotenv/config";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { datosDeUna } from "../src/lib/configuracion-servicio";

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

async function propiedad() {
  const adm = await db.administradora.create({ data: { nombre: `Prueba estructura ${Date.now()}-${Math.random()}` } });
  creadas.push(adm.id);
  const c = await db.condominio.create({ data: { administradoraId: adm.id, nombre: "Edificio Ficticio", direccion: "Calle 1" } });
  return { adm, c };
}

describe("estructura física (COM-001)", () => {
  test("una torre con pisos no se puede borrar; al borrar un piso vacío la unidad queda sin piso, no se borra", async () => {
    const { adm, c } = await propiedad();
    const torre = await db.agrupacion.create({ data: { administradoraId: adm.id, condominioId: c.id, tipo: "TORRE", nombre: "A" } });
    const piso = await db.agrupacion.create({ data: { administradoraId: adm.id, condominioId: c.id, tipo: "PISO", nombre: "1", padreId: torre.id } });
    await assert.rejects(db.agrupacion.delete({ where: { id: torre.id } }));
    const u = await db.unidad.create({ data: { administradoraId: adm.id, condominioId: c.id, numero: "101", alicuota: 100, agrupacionId: piso.id } });
    await db.agrupacion.delete({ where: { id: piso.id } });
    assert.equal((await db.unidad.findUnique({ where: { id: u.id } }))?.agrupacionId, null);
  });

  test("no se repite el código de un estacionamiento, pero sí puede haber bodega con el mismo número", async () => {
    const { adm, c } = await propiedad();
    const base = { administradoraId: adm.id, condominioId: c.id, codigo: "12" };
    await db.espacio.create({ data: { ...base, clase: "ESTACIONAMIENTO" } });
    await assert.rejects(db.espacio.create({ data: { ...base, clase: "ESTACIONAMIENTO" } }));
    const b = await db.espacio.create({ data: { ...base, clase: "BODEGA" } });
    assert.equal(b.regimen, "POR_DEFINIR");
    assert.equal(b.estado, "DISPONIBLE");
  });

  test("borrar una unidad no borra el estacionamiento que le pertenecía ni su historial de uso", async () => {
    const { adm, c } = await propiedad();
    const u = await db.unidad.create({ data: { administradoraId: adm.id, condominioId: c.id, numero: "201", alicuota: 100 } });
    const e = await db.espacio.create({
      data: { administradoraId: adm.id, condominioId: c.id, clase: "ESTACIONAMIENTO", codigo: "E-1", regimen: "ACCESORIO", unidadPrincipalId: u.id },
    });
    await db.asignacionEspacio.create({
      data: { espacioId: e.id, tipo: "PERMANENTE", unidadId: u.id, beneficiario: "Unidad 201", desde: new Date("2026-01-01"), creadoPor: "Prueba" },
    });
    await db.unidad.delete({ where: { id: u.id } });
    const despues = await db.espacio.findUnique({ where: { id: e.id }, include: { asignaciones: true } });
    assert.equal(despues?.unidadPrincipalId, null);
    assert.equal(despues?.asignaciones.length, 1);
    assert.equal(despues?.asignaciones[0].beneficiario, "Unidad 201");
  });

  test("el configurador cuenta la estructura registrada", async () => {
    const { adm, c } = await propiedad();
    await db.agrupacion.create({ data: { administradoraId: adm.id, condominioId: c.id, tipo: "SECTOR", nombre: "Norte" } });
    await db.instalacion.create({ data: { administradoraId: adm.id, condominioId: c.id, tipo: "BOMBA", codigo: "BOM-1", nombre: "Sala de bombas" } });
    const d = await datosDeUna(adm.id, c.id);
    assert.deepEqual(d?.estructura, { agrupaciones: 1, espacios: 0, instalaciones: 1 });
  });
});
